#!/usr/bin/env python3
"""
plasmid_editor.py — PyQt5 GUI for creating and editing plasmid feature maps
for the Restriction Cloning Educational Game.

Usage:
    python3 plasmid_editor.py [plasmid.json]
"""

import sys, json, math
from dataclasses import dataclass, field, asdict
from typing import List, Optional
from copy import deepcopy

from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QHBoxLayout, QVBoxLayout,
    QListWidget, QPushButton, QLabel, QLineEdit, QComboBox, QSpinBox,
    QColorDialog, QFileDialog, QDialog, QDialogButtonBox, QFormLayout,
    QGroupBox, QCheckBox, QScrollArea, QMessageBox, QMenu, QAction,
    QSplitter, QFrame
)
from PyQt5.QtCore import Qt, QPointF, QRectF, pyqtSignal
from PyQt5.QtGui import (
    QPainter, QPen, QBrush, QColor, QFont, QPainterPath,
    QPolygonF, QFontMetrics, QPalette
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FEATURE_TYPES = ['gene', 'promoter', 'resistance', 'ori', 'mcs',
                 'lacZ', 'terminator', 'region']

ENZYME_NAMES = [
    'EcoRI', 'BamHI', 'HindIII', 'KpnI', 'SmaI', 'XbaI', 'SalI',
    'PstI', 'NcoI', 'NotI', 'XhoI', 'SpeI', 'NheI', 'ClaI', 'SacI',
    'MluI', 'ApaI', 'AscI', 'PacI', 'SfiI'
]

DEFAULT_COLORS = {
    'gene':       '#90CAF9',
    'promoter':   '#FFCC02',
    'resistance': '#EF5350',
    'ori':        '#4FC3F7',
    'mcs':        '#A5D6A7',
    'lacZ':       '#80DEEA',
    'terminator': '#FF7043',
    'region':     '#B0BEC5',
}

BG_DARK  = QColor('#1A2332')
BG_MID   = QColor('#263545')
BG_LIGHT = QColor('#2C3E50')
TEXT_COL = QColor('#CFD8DC')
ACCENT   = QColor('#4D96FF')

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class Feature:
    name:         str  = 'New Feature'
    start:        int  = 0
    end:          int  = 100
    type:         str  = 'gene'
    strand:       int  = 1       # 1 = CW, -1 = CCW
    color:        str  = '#90CAF9'
    lineWidth:    int  = 15
    showArrow:    bool = True
    showPromoter: bool = False   # promoter symbol instead of/in addition to arrow


@dataclass
class RestrictionSite:
    enzyme:   str = 'EcoRI'
    position: int = 0


@dataclass
class PlasmidModel:
    name:      str                     = 'New Plasmid'
    length:    int                     = 3000
    features:  List[Feature]           = field(default_factory=list)
    cut_sites: List[RestrictionSite]   = field(default_factory=list)


# ---------------------------------------------------------------------------
# Canvas
# ---------------------------------------------------------------------------

class PlasmidCanvas(QWidget):
    featureSelected = pyqtSignal(object)   # Feature | RestrictionSite | None
    featureModified = pyqtSignal(object)

    OUTER_R  = 0.30   # fraction of min(w, h)
    INNER_R  = 0.23
    FEAT_OFF = 0.048  # half-width offset from outer ring to arc centre

    def __init__(self, parent=None):
        super().__init__(parent)
        self.model         = PlasmidModel()
        self._selected     = None
        self._drag_handle  = None   # (handle_str, Feature)
        self.setMinimumSize(520, 520)
        self.setMouseTracking(True)
        p = self.palette()
        p.setColor(QPalette.Window, BG_DARK)
        self.setPalette(p)
        self.setAutoFillBackground(True)

    # ------------------------------------------------------------------
    # Layout helpers
    # ------------------------------------------------------------------

    def _geo(self):
        w, h = self.width(), self.height()
        m = min(w, h)
        return w/2, h/2, m*self.OUTER_R, m*self.INNER_R, m*self.FEAT_OFF, m

    def _bp_to_deg(self, bp):
        """bp → degrees in screen coords (0° = right/3 o'clock, CW positive)."""
        return (bp / self.model.length) * 360.0 - 90.0

    def _deg_to_bp(self, deg):
        return int(((deg + 90.0) % 360.0) / 360.0 * self.model.length + 0.5)

    def _pt(self, cx, cy, r, deg):
        rad = math.radians(deg)
        return QPointF(cx + r*math.cos(rad), cy + r*math.sin(rad))

    # ------------------------------------------------------------------
    # Paint
    # ------------------------------------------------------------------

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        p.fillRect(self.rect(), BG_DARK)
        cx, cy, outer, inner, feat_hw, m = self._geo()
        feat_r = outer + feat_hw * 0.3
        self._draw_backbone(p, cx, cy, outer, inner)
        self._draw_features(p, cx, cy, outer, inner, feat_r, feat_hw)
        self._draw_restriction_sites(p, cx, cy, outer, feat_hw)
        self._draw_center_label(p, cx, cy)

    def _draw_backbone(self, p, cx, cy, outer, inner):
        # Ring fill
        outer_path = QPainterPath()
        outer_path.addEllipse(QPointF(cx, cy), outer, outer)
        inner_path = QPainterPath()
        inner_path.addEllipse(QPointF(cx, cy), inner, inner)
        p.fillPath(outer_path - inner_path, BG_MID)
        # Outlines
        pen = QPen(QColor('#546E7A'), 2)
        p.setPen(pen)
        p.setBrush(Qt.NoBrush)
        p.drawEllipse(QPointF(cx, cy), outer, outer)
        p.drawEllipse(QPointF(cx, cy), inner, inner)

    def _arc(self, p, cx, cy, r, start_deg, end_deg, color, width, selected=False):
        """Draw a clockwise arc from start_deg to end_deg."""
        cw_span = (end_deg - start_deg) % 360.0
        if cw_span == 0:
            cw_span = 360.0
        pen = QPen(QColor(color), width + 4 if selected else width,
                   Qt.SolidLine, Qt.FlatCap)
        if selected:
            pen.setColor(QColor('#FFFFFF'))
        p.setPen(pen)
        p.setBrush(Qt.NoBrush)
        rect = QRectF(cx - r, cy - r, 2*r, 2*r)
        # Qt drawArc: angle in 1/16° CCW from 3 o'clock
        # Our deg (CW from 3 o'clock) → Qt: negate
        qt_start = int(-start_deg * 16)
        qt_span  = int(-cw_span   * 16)
        p.drawArc(rect, qt_start, qt_span)

    def _arrowhead(self, p, tip: QPointF, dir_deg: float, color: str, size=10):
        rad = math.radians(dir_deg)
        dx, dy = math.cos(rad), math.sin(rad)
        px, py = -dy, dx
        h = size * 0.5
        back = size
        poly = QPolygonF([
            tip,
            QPointF(tip.x() - dx*back - px*h, tip.y() - dy*back - py*h),
            QPointF(tip.x() - dx*back + px*h, tip.y() - dy*back + py*h),
        ])
        p.setPen(Qt.NoPen)
        p.setBrush(QBrush(QColor(color)))
        p.drawPolygon(poly)

    def _promoter_symbol(self, p, cx, cy, outer, deg, color, dir_cw=True,
                         stem=40, arm=40, head=10, head_half=8):
        rad = math.radians(deg)
        ca, sa = math.cos(rad), math.sin(rad)
        base = QPointF(cx + outer*ca, cy + outer*sa)
        tip  = QPointF(cx + (outer+stem)*ca, cy + (outer+stem)*sa)
        sign = 1 if dir_cw else -1
        tx, ty = -sa*sign, ca*sign
        arm_end = QPointF(tip.x() + tx*arm, tip.y() + ty*arm)
        pen = QPen(QColor(color), 1.8)
        p.setPen(pen)
        p.setBrush(Qt.NoBrush)
        path = QPainterPath()
        path.moveTo(base); path.lineTo(tip); path.lineTo(arm_end)
        p.drawPath(path)
        arr_deg = math.degrees(math.atan2(ty, tx))
        self._arrowhead(p, arm_end, arr_deg, color, size=head_half*2)

    def _draw_features(self, p, cx, cy, outer, inner, feat_r, feat_hw):
        for feat in self.model.features:
            sel = feat is self._selected
            color = feat.color or DEFAULT_COLORS.get(feat.type, '#B0BEC5')
            sd = self._bp_to_deg(feat.start)
            ed = self._bp_to_deg(feat.end)

            self._arc(p, cx, cy, feat_r, sd, ed, color, feat.lineWidth, sel)

            # Arrow on arc
            if feat.showArrow and not feat.showPromoter:
                arrow_deg = ed if feat.strand == 1 else sd
                tip = self._pt(cx, cy, feat_r, arrow_deg)
                tan_deg = arrow_deg + (90 if feat.strand == 1 else -90)
                self._arrowhead(p, tip, tan_deg, color, size=feat.lineWidth)

            # Promoter symbol
            if feat.showPromoter:
                prom_deg = sd if feat.strand == 1 else ed
                self._promoter_symbol(p, cx, cy, outer, prom_deg, color,
                                      dir_cw=(feat.strand == 1))

            # Label
            mid_deg = self._bp_to_deg((feat.start + feat.end) / 2)
            self._feature_label(p, cx, cy, outer, feat_r, feat_hw,
                                mid_deg, feat.name, color, sel)

            # Drag handles when selected
            if sel:
                p.setPen(QPen(QColor('#FFFFFF'), 2))
                p.setBrush(QBrush(QColor(color)))
                for deg in [sd, ed]:
                    pt = self._pt(cx, cy, feat_r, deg)
                    p.drawEllipse(pt, 7, 7)

    def _feature_label(self, p, cx, cy, outer, feat_r, feat_hw,
                       mid_deg, name, color, bold):
        elbow_r = outer * 1.38
        arm_len = outer * 0.12
        rad = math.radians(mid_deg)
        ca, sa = math.cos(rad), math.sin(rad)
        lx0 = cx + (feat_r + feat_hw) * ca
        ly0 = cy + (feat_r + feat_hw) * sa
        ex  = cx + elbow_r * ca
        ey  = cy + elbow_r * sa
        go_right = ca >= 0
        tx = ex + (arm_len if go_right else -arm_len)
        ty = ey

        pen = QPen(QColor('#FFFFFF' if bold else color),
                   1.5 if bold else 0.9,
                   Qt.SolidLine if bold else Qt.DashLine)
        p.setPen(pen)
        path = QPainterPath()
        path.moveTo(lx0, ly0); path.lineTo(ex, ey); path.lineTo(tx, ty)
        p.drawPath(path)

        font = QFont('Arial', 11)
        font.setBold(bold)
        p.setFont(font)
        p.setPen(QPen(QColor('#FFFFFF' if bold else color)))
        align = Qt.AlignLeft | Qt.AlignVCenter if go_right else Qt.AlignRight | Qt.AlignVCenter
        ox = tx + (3 if go_right else -3)
        p.drawText(QRectF(ox if go_right else ox - 130, ty - 10, 130, 20),
                   align, name)

    def _draw_restriction_sites(self, p, cx, cy, outer, feat_hw):
        palette = ['#FF6B6B','#FFD93D','#6BCB77','#4D96FF','#C77DFF',
                   '#FF9F43','#54A0FF','#01CBC6','#FD7272','#A8E063']
        color_map = {}
        idx = 0
        for s in self.model.cut_sites:
            if s.enzyme not in color_map:
                color_map[s.enzyme] = palette[idx % len(palette)]
                idx += 1
        for site in self.model.cut_sites:
            color = color_map[site.enzyme]
            sel   = site is self._selected
            deg   = self._bp_to_deg(site.position)
            rad   = math.radians(deg)
            ca, sa = math.cos(rad), math.sin(rad)
            tick_in  = outer
            tick_out = outer + feat_hw
            p.setPen(QPen(QColor(color), 3 if sel else 2))
            p.drawLine(QPointF(cx + tick_in*ca,  cy + tick_in*sa),
                       QPointF(cx + tick_out*ca, cy + tick_out*sa))
            # Label
            label_r = outer + feat_hw + 14
            lx = cx + label_r * ca
            ly = cy + label_r * sa
            font = QFont('Courier', 9)
            font.setBold(True)
            p.setFont(font)
            p.setPen(QPen(QColor(color)))
            fm = QFontMetrics(font)
            tw = fm.horizontalAdvance(site.enzyme)
            p.drawText(QRectF(lx - tw/2, ly - 8, tw + 4, 16),
                       Qt.AlignCenter, site.enzyme)

    def _draw_center_label(self, p, cx, cy):
        font = QFont('Arial', 14)
        font.setBold(True)
        p.setFont(font)
        p.setPen(QPen(QColor('#CFD8DC')))
        p.drawText(QRectF(cx-90, cy-22, 180, 24), Qt.AlignCenter, self.model.name)
        font2 = QFont('Courier', 11)
        p.setFont(font2)
        p.setPen(QPen(QColor('#90A4AE')))
        p.drawText(QRectF(cx-90, cy+4, 180, 20), Qt.AlignCenter,
                   f'{self.model.length:,} bp')

    # ------------------------------------------------------------------
    # Hit testing
    # ------------------------------------------------------------------

    def _hit(self, pos: QPointF):
        """Return (item, handle) or (None, None)."""
        cx, cy, outer, inner, feat_hw, _ = self._geo()
        feat_r = outer + feat_hw * 0.3
        dx, dy = pos.x()-cx, pos.y()-cy
        dist   = math.hypot(dx, dy)
        click_deg = math.degrees(math.atan2(dy, dx))

        # Restriction site ticks (slightly outside outer ring)
        if abs(dist - (outer + feat_hw*0.5)) < 18:
            best, best_diff = None, 8.0
            for site in self.model.cut_sites:
                site_deg = self._bp_to_deg(site.position)
                diff = abs(((click_deg - site_deg + 180) % 360) - 180)
                if diff < best_diff:
                    best, best_diff = site, diff
            if best:
                return best, 'pos'

        # Feature arc handles and body
        if abs(dist - feat_r) < 14:
            for feat in reversed(self.model.features):
                sd = self._bp_to_deg(feat.start)
                ed = self._bp_to_deg(feat.end)
                for handle, deg in [('start', sd), ('end', ed)]:
                    pt = self._pt(cx, cy, feat_r, deg)
                    if math.hypot(pos.x()-pt.x(), pos.y()-pt.y()) < 10:
                        return feat, handle
                # Body: check angular range
                span = (ed - sd) % 360.0
                rel  = (click_deg - sd) % 360.0
                if rel <= span:
                    return feat, 'body'
        return None, None

    # ------------------------------------------------------------------
    # Mouse
    # ------------------------------------------------------------------

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            item, handle = self._hit(QPointF(event.pos()))
            self._selected = item
            self._drag_handle = (handle, item) if handle in ('start','end') else None
            self.featureSelected.emit(item)
            self.update()
        elif event.button() == Qt.RightButton:
            item, _ = self._hit(QPointF(event.pos()))
            if item:
                self._selected = item
                self.featureSelected.emit(item)
                self.update()
                self._context_menu(event.globalPos(), item)

    def mouseMoveEvent(self, event):
        if self._drag_handle:
            handle, feat = self._drag_handle
            cx, cy = self.width()/2, self.height()/2
            dx, dy = event.pos().x()-cx, event.pos().y()-cy
            deg = math.degrees(math.atan2(dy, dx))
            bp  = self._deg_to_bp(deg)
            bp  = max(0, min(bp, self.model.length - 1))
            if handle == 'start':
                feat.start = min(bp, feat.end - 1)
            else:
                feat.end = max(bp, feat.start + 1)
            self.featureModified.emit(feat)
            self.update()

    def mouseReleaseEvent(self, _):
        self._drag_handle = None

    def _context_menu(self, gpos, item):
        menu = QMenu(self)
        edit_act = menu.addAction('Edit…')
        del_act  = menu.addAction('Delete')
        act = menu.exec_(gpos)
        mw = self._main_window()
        if act == edit_act and mw:
            if isinstance(item, Feature):
                mw.edit_feature(item)
            else:
                mw.edit_restriction_site(item)
        elif act == del_act:
            if isinstance(item, Feature) and item in self.model.features:
                self.model.features.remove(item)
            elif isinstance(item, RestrictionSite) and item in self.model.cut_sites:
                self.model.cut_sites.remove(item)
            self._selected = None
            self.featureSelected.emit(None)
            self.update()

    def _main_window(self):
        w = self.parent()
        while w and not isinstance(w, MainWindow):
            w = w.parent()
        return w


# ---------------------------------------------------------------------------
# Feature dialog
# ---------------------------------------------------------------------------

class FeatureDialog(QDialog):
    def __init__(self, feature: Feature = None, max_bp=3000, parent=None):
        super().__init__(parent)
        self.setWindowTitle('Add Feature' if feature is None else 'Edit Feature')
        self._feat  = deepcopy(feature) if feature else Feature()
        self._color = QColor(self._feat.color)
        self._max   = max_bp
        self._build()

    def _build(self):
        layout = QFormLayout(self)
        layout.setSpacing(10)

        self.name_e  = QLineEdit(self._feat.name);         layout.addRow('Name:',         self.name_e)
        self.type_cb = QComboBox();  self.type_cb.addItems(FEATURE_TYPES)
        self.type_cb.setCurrentText(self._feat.type);      layout.addRow('Type:',         self.type_cb)
        self.type_cb.currentTextChanged.connect(self._type_changed)

        self.start_s = QSpinBox();   self.start_s.setRange(0, self._max-1)
        self.start_s.setValue(self._feat.start);           layout.addRow('Start (bp):',   self.start_s)
        self.end_s   = QSpinBox();   self.end_s.setRange(1, self._max)
        self.end_s.setValue(self._feat.end);               layout.addRow('End (bp):',     self.end_s)

        self.strand_cb = QComboBox(); self.strand_cb.addItems(['Forward (+1)', 'Reverse (−1)'])
        self.strand_cb.setCurrentIndex(0 if self._feat.strand == 1 else 1)
        layout.addRow('Strand:', self.strand_cb)

        self.color_btn = QPushButton(); self.color_btn.setFixedWidth(90)
        self.color_btn.clicked.connect(self._pick_color)
        self._refresh_color_btn();                         layout.addRow('Color:',        self.color_btn)

        self.width_s = QSpinBox(); self.width_s.setRange(2, 50)
        self.width_s.setValue(self._feat.lineWidth);       layout.addRow('Arc width (px):', self.width_s)

        self.arrow_cb    = QCheckBox('Directional arrow at arc end')
        self.arrow_cb.setChecked(self._feat.showArrow);    layout.addRow('', self.arrow_cb)
        self.promoter_cb = QCheckBox('Promoter symbol (stem + arm + arrow)')
        self.promoter_cb.setChecked(self._feat.showPromoter); layout.addRow('', self.promoter_cb)

        btns = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        btns.accepted.connect(self.accept); btns.rejected.connect(self.reject)
        layout.addRow(btns)

    def _type_changed(self, t):
        if t in DEFAULT_COLORS and not self._color.isValid():
            self._color = QColor(DEFAULT_COLORS[t])
            self._refresh_color_btn()

    def _pick_color(self):
        c = QColorDialog.getColor(self._color, self)
        if c.isValid():
            self._color = c
            self._refresh_color_btn()

    def _refresh_color_btn(self):
        self.color_btn.setStyleSheet(
            f'background:{self._color.name()};color:{"#000" if self._color.lightness()>128 else "#fff"};'
            f'border:1px solid #555;border-radius:3px;')
        self.color_btn.setText(self._color.name())

    def result_feature(self) -> Feature:
        f = self._feat
        f.name         = self.name_e.text().strip() or 'Feature'
        f.type         = self.type_cb.currentText()
        f.start        = self.start_s.value()
        f.end          = self.end_s.value()
        f.strand       = 1 if self.strand_cb.currentIndex() == 0 else -1
        f.color        = self._color.name()
        f.lineWidth    = self.width_s.value()
        f.showArrow    = self.arrow_cb.isChecked()
        f.showPromoter = self.promoter_cb.isChecked()
        return f


# ---------------------------------------------------------------------------
# Restriction site dialog
# ---------------------------------------------------------------------------

class SiteDialog(QDialog):
    def __init__(self, site: RestrictionSite = None, max_bp=3000, parent=None):
        super().__init__(parent)
        self.setWindowTitle('Add Restriction Site' if site is None else 'Edit Site')
        self._site = deepcopy(site) if site else RestrictionSite()
        self._max  = max_bp
        self._build()

    def _build(self):
        layout = QFormLayout(self)
        layout.setSpacing(10)
        self.enzyme_cb = QComboBox(); self.enzyme_cb.setEditable(True)
        self.enzyme_cb.addItems(ENZYME_NAMES)
        self.enzyme_cb.setCurrentText(self._site.enzyme)
        layout.addRow('Enzyme:', self.enzyme_cb)
        self.pos_s = QSpinBox(); self.pos_s.setRange(0, self._max-1)
        self.pos_s.setValue(self._site.position)
        layout.addRow('Position (bp):', self.pos_s)
        btns = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        btns.accepted.connect(self.accept); btns.rejected.connect(self.reject)
        layout.addRow(btns)

    def result_site(self) -> RestrictionSite:
        self._site.enzyme   = self.enzyme_cb.currentText().strip()
        self._site.position = self.pos_s.value()
        return self._site


# ---------------------------------------------------------------------------
# Properties / sidebar panel
# ---------------------------------------------------------------------------

class PropertiesPanel(QWidget):
    def __init__(self, canvas: PlasmidCanvas, parent=None):
        super().__init__(parent)
        self.canvas = canvas
        self._item  = None
        self._build()
        canvas.featureSelected.connect(self._on_select)
        canvas.featureModified.connect(self._on_modified)

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(8, 8, 8, 8)
        root.setSpacing(8)

        # ---- Plasmid settings ----
        pg = QGroupBox('Plasmid')
        pl = QFormLayout(pg); pl.setSpacing(6)
        self.pname = QLineEdit()
        self.pname.editingFinished.connect(self._plasmid_changed)
        self.plen  = QSpinBox(); self.plen.setRange(100, 200000)
        self.plen.setSingleStep(100)
        self.plen.valueChanged.connect(self._plasmid_changed)
        pl.addRow('Name:',        self.pname)
        pl.addRow('Length (bp):', self.plen)
        root.addWidget(pg)

        # ---- Feature list ----
        fg = QGroupBox('Features')
        fl = QVBoxLayout(fg); fl.setSpacing(4)
        self.feat_list = QListWidget(); self.feat_list.setMaximumHeight(160)
        self.feat_list.currentRowChanged.connect(self._feat_row_changed)
        self.feat_list.itemDoubleClicked.connect(lambda _: self._edit_selected_item())
        fl.addWidget(self.feat_list)
        fbr = QHBoxLayout()
        for label, slot in [('+ Add', self._add_feature), ('Edit', self._edit_selected_item),
                             ('Delete', self._delete_item)]:
            b = QPushButton(label); b.clicked.connect(slot); fbr.addWidget(b)
        fl.addLayout(fbr)
        root.addWidget(fg)

        # ---- Restriction sites ----
        rg = QGroupBox('Restriction Sites')
        rl = QVBoxLayout(rg); rl.setSpacing(4)
        self.site_list = QListWidget(); self.site_list.setMaximumHeight(110)
        self.site_list.currentRowChanged.connect(self._site_row_changed)
        self.site_list.itemDoubleClicked.connect(lambda _: self._edit_selected_item())
        rl.addWidget(self.site_list)
        rbr = QHBoxLayout()
        for label, slot in [('+ Add', self._add_site), ('Edit', self._edit_selected_item),
                             ('Delete', self._delete_item)]:
            b = QPushButton(label); b.clicked.connect(slot); rbr.addWidget(b)
        rl.addLayout(rbr)
        root.addWidget(rg)

        # ---- Inline quick-edit ----
        self.qe_group = QGroupBox('Selected')
        self.qe_layout = QFormLayout(self.qe_group)
        root.addWidget(self.qe_group)

        root.addStretch()
        self._refresh()

    # ------------------------------------------------------------------

    def _refresh(self):
        m = self.canvas.model
        self.pname.blockSignals(True); self.pname.setText(m.name); self.pname.blockSignals(False)
        self.plen.blockSignals(True);  self.plen.setValue(m.length); self.plen.blockSignals(False)
        self.feat_list.blockSignals(True)
        self.feat_list.clear()
        for f in m.features:
            self.feat_list.addItem(f'  {f.name}  ({f.type})')
        self.feat_list.blockSignals(False)
        self.site_list.blockSignals(True)
        self.site_list.clear()
        for s in m.cut_sites:
            self.site_list.addItem(f'  {s.enzyme}  @ bp {s.position}')
        self.site_list.blockSignals(False)

    def _plasmid_changed(self):
        self.canvas.model.name   = self.pname.text()
        self.canvas.model.length = self.plen.value()
        self.canvas.update()

    def _on_select(self, item):
        self._item = item
        self._refresh()
        # Highlight correct list row
        if isinstance(item, Feature):
            idx = self.canvas.model.features.index(item) if item in self.canvas.model.features else -1
            self.feat_list.blockSignals(True)
            self.feat_list.setCurrentRow(idx)
            self.feat_list.blockSignals(False)
        elif isinstance(item, RestrictionSite):
            idx = self.canvas.model.cut_sites.index(item) if item in self.canvas.model.cut_sites else -1
            self.site_list.blockSignals(True)
            self.site_list.setCurrentRow(idx)
            self.site_list.blockSignals(False)
        self._build_quick_edit(item)

    def _on_modified(self, item):
        self._refresh()
        self._build_quick_edit(item)

    def _build_quick_edit(self, item):
        # Clear
        while self.qe_layout.rowCount():
            self.qe_layout.removeRow(0)
        if isinstance(item, Feature):
            self.qe_group.setTitle(f'Feature: {item.name}')
            self._qe_int('Start (bp)', item.start, 0, self.canvas.model.length,
                         lambda v: self._set_feat(item, 'start', v))
            self._qe_int('End (bp)',   item.end,   0, self.canvas.model.length,
                         lambda v: self._set_feat(item, 'end', v))
            self._qe_int('Width (px)', item.lineWidth, 1, 50,
                         lambda v: self._set_feat(item, 'lineWidth', v))
        elif isinstance(item, RestrictionSite):
            self.qe_group.setTitle(f'Site: {item.enzyme}')
            self._qe_int('Position (bp)', item.position, 0, self.canvas.model.length,
                         lambda v: self._set_site(item, 'position', v))
        else:
            self.qe_group.setTitle('Selected')

    def _qe_int(self, label, value, mn, mx, setter):
        spin = QSpinBox(); spin.setRange(mn, mx); spin.setValue(value)
        spin.valueChanged.connect(lambda v: (setter(v), self.canvas.update()))
        self.qe_layout.addRow(label + ':', spin)

    @staticmethod
    def _set_feat(feat, attr, val):
        setattr(feat, attr, val)

    @staticmethod
    def _set_site(site, attr, val):
        setattr(site, attr, val)

    def _feat_row_changed(self, row):
        feats = self.canvas.model.features
        if 0 <= row < len(feats):
            self.canvas._selected = feats[row]
            self.canvas.featureSelected.emit(feats[row])
            self.canvas.update()

    def _site_row_changed(self, row):
        sites = self.canvas.model.cut_sites
        if 0 <= row < len(sites):
            self.canvas._selected = sites[row]
            self.canvas.featureSelected.emit(sites[row])
            self.canvas.update()

    def _add_feature(self):
        dlg = FeatureDialog(max_bp=self.canvas.model.length, parent=self)
        if dlg.exec_() == QDialog.Accepted:
            feat = dlg.result_feature()
            self.canvas.model.features.append(feat)
            self.canvas._selected = feat
            self.canvas.featureSelected.emit(feat)
            self._refresh()
            self.canvas.update()

    def _add_site(self):
        dlg = SiteDialog(max_bp=self.canvas.model.length, parent=self)
        if dlg.exec_() == QDialog.Accepted:
            site = dlg.result_site()
            self.canvas.model.cut_sites.append(site)
            self.canvas._selected = site
            self.canvas.featureSelected.emit(site)
            self._refresh()
            self.canvas.update()

    def _edit_selected_item(self):
        item = self.canvas._selected
        mw = self.canvas._main_window()
        if isinstance(item, Feature) and mw:
            mw.edit_feature(item)
        elif isinstance(item, RestrictionSite) and mw:
            mw.edit_restriction_site(item)

    def _delete_item(self):
        item = self.canvas._selected
        m    = self.canvas.model
        if isinstance(item, Feature) and item in m.features:
            m.features.remove(item)
        elif isinstance(item, RestrictionSite) and item in m.cut_sites:
            m.cut_sites.remove(item)
        else:
            return
        self.canvas._selected = None
        self.canvas.featureSelected.emit(None)
        self._refresh()
        self.canvas.update()


# ---------------------------------------------------------------------------
# Main window
# ---------------------------------------------------------------------------

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('Plasmid Map Editor — Restriction Cloning Game')
        self.resize(1000, 680)
        self._build_ui()
        self._build_menu()

    def _build_ui(self):
        splitter = QSplitter(Qt.Horizontal)
        self.canvas = PlasmidCanvas()
        splitter.addWidget(self.canvas)

        self.props = PropertiesPanel(self.canvas)
        scroll = QScrollArea()
        scroll.setWidget(self.props)
        scroll.setWidgetResizable(True)
        scroll.setMinimumWidth(270)
        scroll.setMaximumWidth(310)
        splitter.addWidget(scroll)
        splitter.setStretchFactor(0, 3)
        splitter.setStretchFactor(1, 1)
        self.setCentralWidget(splitter)

    def _build_menu(self):
        mb = self.menuBar()
        fm = mb.addMenu('File')
        for label, shortcut, slot in [
            ('New',                  'Ctrl+N', self._new),
            ('Open JSON…',           'Ctrl+O', self._open),
            ('Save JSON…',           'Ctrl+S', self._save),
            (None, None, None),
            ('Export for Game…',     '',       self._export_game),
        ]:
            if label is None:
                fm.addSeparator()
            else:
                act = QAction(label, self)
                if shortcut:
                    act.setShortcut(shortcut)
                act.triggered.connect(slot)
                fm.addAction(act)

    # ------------------------------------------------------------------
    # File operations
    # ------------------------------------------------------------------

    def _new(self):
        self.canvas.model    = PlasmidModel()
        self.canvas._selected = None
        self.props._refresh()
        self.canvas.update()

    def _open(self, path=None):
        if not path:
            path, _ = QFileDialog.getOpenFileName(self, 'Open', '', 'JSON (*.json)')
        if not path:
            return
        try:
            with open(path) as f:
                data = json.load(f)
            m = PlasmidModel()
            m.name   = data.get('name', 'Plasmid')
            m.length = data.get('length', 3000)
            valid_feat = set(Feature.__dataclass_fields__)
            valid_site = set(RestrictionSite.__dataclass_fields__)
            m.features  = [Feature(**{k: v for k, v in d.items() if k in valid_feat})
                           for d in data.get('features', [])]
            m.cut_sites = [RestrictionSite(**{k: v for k, v in d.items() if k in valid_site})
                           for d in data.get('cut_sites', [])]
            self.canvas.model    = m
            self.canvas._selected = None
            self.props._refresh()
            self.canvas.update()
        except Exception as e:
            QMessageBox.critical(self, 'Error opening file', str(e))

    def _save(self):
        path, _ = QFileDialog.getSaveFileName(self, 'Save', '', 'JSON (*.json)')
        if not path:
            return
        m = self.canvas.model
        with open(path, 'w') as f:
            json.dump({
                'name':      m.name,
                'length':    m.length,
                'features':  [asdict(ft) for ft in m.features],
                'cut_sites': [asdict(s)  for s  in m.cut_sites],
            }, f, indent=2)

    def _export_game(self):
        """Export in cloning.json donor/vector compatible format."""
        path, _ = QFileDialog.getSaveFileName(self, 'Export', '', 'JSON (*.json)')
        if not path:
            return
        m = self.canvas.model
        with open(path, 'w') as f:
            json.dump({
                'name':   m.name,
                'length': m.length,
                'features': [
                    {'name': ft.name, 'start': ft.start, 'end': ft.end,
                     'type': ft.type, 'strand': ft.strand}
                    for ft in m.features
                ],
                'cut_sites': [
                    {'enzyme': s.enzyme, 'position': s.position}
                    for s in m.cut_sites
                ],
            }, f, indent=2)
        QMessageBox.information(self, 'Exported',
            f'Saved game-compatible JSON to:\n{path}')

    # ------------------------------------------------------------------
    # Edit helpers (called from canvas context menu and sidebar)
    # ------------------------------------------------------------------

    def edit_feature(self, feat: Feature):
        dlg = FeatureDialog(feat, self.canvas.model.length, self)
        if dlg.exec_() == QDialog.Accepted:
            updated = dlg.result_feature()
            idx = self.canvas.model.features.index(feat)
            self.canvas.model.features[idx] = updated
            self.canvas._selected = updated
            self.props._refresh()
            self.canvas.update()

    def edit_restriction_site(self, site: RestrictionSite):
        dlg = SiteDialog(site, self.canvas.model.length, self)
        if dlg.exec_() == QDialog.Accepted:
            updated = dlg.result_site()
            idx = self.canvas.model.cut_sites.index(site)
            self.canvas.model.cut_sites[idx] = updated
            self.canvas._selected = updated
            self.props._refresh()
            self.canvas.update()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def _dark_palette():
    pal = QPalette()
    roles = {
        QPalette.Window:          '#1A2332',
        QPalette.WindowText:      '#CFD8DC',
        QPalette.Base:            '#263545',
        QPalette.AlternateBase:   '#1E2D3D',
        QPalette.Text:            '#CFD8DC',
        QPalette.Button:          '#2C3E50',
        QPalette.ButtonText:      '#CFD8DC',
        QPalette.Highlight:       '#4D96FF',
        QPalette.HighlightedText: '#FFFFFF',
        QPalette.ToolTipBase:     '#263545',
        QPalette.ToolTipText:     '#CFD8DC',
    }
    for role, color in roles.items():
        pal.setColor(role, QColor(color))
    return pal


def main():
    app = QApplication(sys.argv)
    app.setStyle('Fusion')
    app.setPalette(_dark_palette())
    win = MainWindow()
    if len(sys.argv) > 1:
        win._open(sys.argv[1])
    win.show()
    sys.exit(app.exec_())


if __name__ == '__main__':
    main()
