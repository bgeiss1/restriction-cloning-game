#!/usr/bin/env python3
"""
level_editor.py — PyQt5 level editor for the Restriction Cloning Educational Game.

Usage:
    python3 level_editor.py [levels/cloning.json]
"""

import sys, json, math, uuid
from dataclasses import dataclass, field, asdict
from typing import List, Optional
from copy import deepcopy
from pathlib import Path
from datetime import datetime

from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QHBoxLayout, QVBoxLayout,
    QListWidget, QPushButton, QLabel, QLineEdit, QComboBox, QSpinBox,
    QColorDialog, QFileDialog, QDialog, QDialogButtonBox, QFormLayout,
    QGroupBox, QCheckBox, QScrollArea, QMessageBox, QMenu, QAction,
    QSplitter, QFrame, QTabWidget, QListWidgetItem, QTextEdit, QGridLayout,
    QToolBar, QSizePolicy, QInputDialog
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

DEFAULT_LEVELS_FILE   = Path(__file__).parent / 'levels' / 'cloning.json'
DEFAULT_LIBRARY_FILE  = Path(__file__).parent / 'levels' / 'plasmid_library.json'

# ---------------------------------------------------------------------------
# Data models
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
    arrowSize:    int  = 0       # 0 = match lineWidth
    showArrow:    bool = True
    showPromoter: bool = False


@dataclass
class RestrictionSite:
    enzyme:   str = 'EcoRI'
    position: int = 0


@dataclass
class PlasmidModel:
    name:      str                   = 'New Plasmid'
    length:    int                   = 3000
    features:  List[Feature]         = field(default_factory=list)
    cut_sites: List[RestrictionSite] = field(default_factory=list)
    base_id:   str                   = ''   # library entry id this was derived from


@dataclass
class LevelObjectives:
    vector_enzymes:      List[str]       = field(default_factory=list)
    donor_enzymes:       List[List[str]] = field(default_factory=list)  # per donor
    correct_fragment:    Optional[str]   = None   # legacy single-donor
    correct_orientation: Optional[str]  = None   # legacy single-donor
    correct_fragments:   List[dict]      = field(default_factory=list)  # multi-donor ordered


@dataclass
class LevelModel:
    id:               str             = 'clone_01'
    title:            str             = 'New Level'
    description:      str             = ''
    teaching_point:   str             = ''
    sequence_note:    str             = ''
    vector_use_puc19: bool            = True
    vector:           PlasmidModel    = field(default_factory=PlasmidModel)
    donors:           List[PlasmidModel] = field(default_factory=lambda: [PlasmidModel(name='New Donor')])
    mcs_enzymes:      List[str]       = field(default_factory=list)
    objectives:       LevelObjectives = field(default_factory=LevelObjectives)


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------

def _plasmid_from_dict(d: dict) -> PlasmidModel:
    valid_feat = set(Feature.__dataclass_fields__)
    valid_site = set(RestrictionSite.__dataclass_fields__)
    m = PlasmidModel()
    m.name    = d.get('name', 'Plasmid')
    m.length  = d.get('length', 3000)
    m.base_id = d.get('base_id', '')
    m.features  = [Feature(**{k: v for k, v in f.items() if k in valid_feat})
                   for f in d.get('features', [])]
    m.cut_sites = [RestrictionSite(**{k: v for k, v in s.items() if k in valid_site})
                   for s in d.get('cut_sites', [])]
    return m


def _plasmid_to_dict(m: PlasmidModel) -> dict:
    d = {
        'name':      m.name,
        'length':    m.length,
        'features':  [asdict(f) for f in m.features],
        'cut_sites': [asdict(s) for s in m.cut_sites],
    }
    if m.base_id:
        d['base_id'] = m.base_id
    return d


def level_from_dict(d: dict) -> LevelModel:
    lm = LevelModel()
    lm.id             = d.get('id', 'clone_01')
    lm.title          = d.get('title', '')
    lm.description    = d.get('description', '')
    lm.teaching_point = d.get('teaching_point', '')
    lm.sequence_note  = d.get('sequence_note', '')

    vec = d.get('vector', {})
    if vec.get('use_pUC19'):
        lm.vector_use_puc19 = True
        lm.vector = PlasmidModel(name='pUC19', base_id=vec.get('base_id', ''))
    else:
        lm.vector_use_puc19 = False
        lm.vector = _plasmid_from_dict(vec)

    # Support both donor (old singular) and donors (new array)
    donors_raw = d.get('donors') or ([d['donor']] if 'donor' in d else [{}])
    lm.donors      = [_plasmid_from_dict(don) for don in donors_raw]
    lm.mcs_enzymes = donors_raw[0].get('mcs_enzymes', []) if donors_raw else []

    obj = d.get('objectives', {})
    # donor_enzymes may be flat list (old) or list-of-lists (new)
    raw_de = obj.get('donor_enzymes', [])
    if raw_de and not isinstance(raw_de[0], list):
        donor_enzymes_norm = [raw_de]  # wrap flat list → single-donor
    else:
        donor_enzymes_norm = raw_de
    lm.objectives = LevelObjectives(
        vector_enzymes      = obj.get('vector_enzymes', []),
        donor_enzymes       = donor_enzymes_norm,
        correct_fragment    = obj.get('correct_fragment'),
        correct_orientation = obj.get('correct_orientation'),
        correct_fragments   = obj.get('correct_fragments', []),
    )
    return lm


def level_to_dict(lm: LevelModel) -> dict:
    if lm.vector_use_puc19:
        vector_dict = {'use_pUC19': True, 'name': 'pUC19'}
        if lm.vector.base_id:
            vector_dict['base_id'] = lm.vector.base_id
    else:
        vector_dict = _plasmid_to_dict(lm.vector)

    # Build donors array
    donor_dicts = []
    for i, donor in enumerate(lm.donors):
        dd = _plasmid_to_dict(donor)
        if i == 0 and lm.mcs_enzymes:
            dd['mcs_enzymes'] = lm.mcs_enzymes
        donor_dicts.append(dd)

    obj = lm.objectives
    # Flatten single-donor enzyme list for backward compat
    de = obj.donor_enzymes
    donor_enzymes_out = de[0] if (len(de) == 1 and len(lm.donors) == 1) else de

    obj_dict = {
        'vector_enzymes':      obj.vector_enzymes,
        'donor_enzymes':       donor_enzymes_out,
        'correct_fragment':    obj.correct_fragment,
        'correct_orientation': obj.correct_orientation,
    }
    if obj.correct_fragments:
        obj_dict['correct_fragments'] = obj.correct_fragments

    return {
        'id':             lm.id,
        'title':          lm.title,
        'description':    lm.description,
        'teaching_point': lm.teaching_point,
        'sequence_note':  lm.sequence_note,
        'vector':         vector_dict,
        'donors':         donor_dicts,
        'objectives':     obj_dict,
    }


# ---------------------------------------------------------------------------
# Plasmid Library
# ---------------------------------------------------------------------------

@dataclass
class LibraryEntry:
    id:       str
    category: str          # 'vector' or 'donor'
    plasmid:  PlasmidModel


class PlasmidLibrary:
    """Manages a persistent library of reusable base plasmids."""

    def __init__(self):
        self._entries: List[LibraryEntry] = []
        self._path: Optional[Path] = None

    # ------------------------------------------------------------------
    # Load / save
    # ------------------------------------------------------------------

    def load(self, path: Path):
        self._path = path
        if not path.exists():
            self._entries = []
            return
        with open(path) as f:
            data = json.load(f)
        self._entries = []
        for cat in ('vector', 'donor'):
            for raw in data.get(cat + 's', []):
                entry_id = raw.get('id', self._generate_id(raw.get('name', 'entry')))
                pm = _plasmid_from_dict(raw)
                self._entries.append(LibraryEntry(id=entry_id, category=cat, plasmid=pm))

    def save(self, path: Path = None, backup: bool = True):
        p = path or self._path
        if p is None:
            return
        if backup and p.exists():
            ts = datetime.now().strftime('%Y%m%d_%H%M%S')
            bak = p.with_suffix(f'.bak_{ts}.json')
            try:
                bak.write_text(p.read_text())
            except Exception:
                pass
        vectors, donors = [], []
        for e in self._entries:
            d = {'id': e.id}
            d.update(_plasmid_to_dict(e.plasmid))
            (vectors if e.category == 'vector' else donors).append(d)
        with open(p, 'w') as f:
            json.dump({'vectors': vectors, 'donors': donors}, f, indent=2)

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_all(self, category: str) -> List[LibraryEntry]:
        return [e for e in self._entries if e.category == category]

    def get_vectors(self) -> List[LibraryEntry]:
        return self.get_all('vector')

    def get_donors(self) -> List[LibraryEntry]:
        return self.get_all('donor')

    def get_by_id(self, entry_id: str) -> Optional[LibraryEntry]:
        for e in self._entries:
            if e.id == entry_id:
                return e
        return None

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def add(self, category: str, plasmid: PlasmidModel) -> str:
        entry_id = self._generate_id(plasmid.name)
        self._entries.append(LibraryEntry(id=entry_id, category=category,
                                          plasmid=deepcopy(plasmid)))
        return entry_id

    def update(self, entry_id: str, plasmid: PlasmidModel):
        for e in self._entries:
            if e.id == entry_id:
                e.plasmid = deepcopy(plasmid)
                return

    def delete(self, entry_id: str):
        self._entries = [e for e in self._entries if e.id != entry_id]

    def find_or_add(self, category: str, plasmid: PlasmidModel) -> str:
        """Return existing entry ID matching name+category, or create a new one."""
        for e in self._entries:
            if e.category == category and e.plasmid.name == plasmid.name:
                return e.id
        return self.add(category, plasmid)

    def _generate_id(self, name: str) -> str:
        slug = ''.join(c if c.isalnum() else '_' for c in name)[:20].strip('_') or 'entry'
        uid  = str(uuid.uuid4())[:6]
        return f'{slug}_{uid}'


# ---------------------------------------------------------------------------
# Canvas  (copied from plasmid_editor.py; _main_window → _editor_widget)
# ---------------------------------------------------------------------------

class PlasmidCanvas(QWidget):
    featureSelected = pyqtSignal(object)   # Feature | RestrictionSite | None
    featureModified = pyqtSignal(object)
    zoomChanged     = pyqtSignal(float)

    OUTER_R  = 0.30
    INNER_R  = 0.23
    FEAT_OFF = 0.048

    def __init__(self, interactive=True, parent=None):
        super().__init__(parent)
        self._interactive  = interactive
        self.model         = PlasmidModel()
        self._selected     = None
        self._drag_handle  = None
        self._zoom         = 1.0
        self.setMinimumSize(520, 520)
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.WheelFocus)
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
        # Apply zoom transform centred on widget
        cxw, cyw = self.width() / 2, self.height() / 2
        p.translate(cxw, cyw)
        p.scale(self._zoom, self._zoom)
        p.translate(-cxw, -cyw)
        cx, cy, outer, inner, feat_hw, m = self._geo()
        feat_r = outer + feat_hw * 0.3
        self._draw_backbone(p, cx, cy, outer, inner)
        self._draw_tick_marks(p, cx, cy, inner)
        self._draw_restriction_sites(p, cx, cy, outer, feat_hw)  # drawn first so features render on top
        self._draw_features(p, cx, cy, outer, inner, feat_r, feat_hw)
        self._draw_center_label(p, cx, cy)

    def _draw_backbone(self, p, cx, cy, outer, inner):
        outer_path = QPainterPath()
        outer_path.addEllipse(QPointF(cx, cy), outer, outer)
        inner_path = QPainterPath()
        inner_path.addEllipse(QPointF(cx, cy), inner, inner)
        p.fillPath(outer_path - inner_path, BG_MID)
        pen = QPen(QColor('#546E7A'), 2)
        p.setPen(pen)
        p.setBrush(Qt.NoBrush)
        p.drawEllipse(QPointF(cx, cy), outer, outer)
        p.drawEllipse(QPointF(cx, cy), inner, inner)

    def _draw_tick_marks(self, p, cx, cy, inner):
        """Draw radial tick marks on the inside of the inner ring, every 15°."""
        for i in range(24):                    # 360° / 15° = 24 ticks
            screen_deg = i * 15 - 90           # -90 puts tick 0 at 12 o'clock (bp 0)
            is_cardinal = (i % 6 == 0)         # every 90°
            is_major    = (i % 3 == 0)         # every 45°

            if is_cardinal:
                tick_len, color, lw = 13, '#607D8B', 1.5
            elif is_major:
                tick_len, color, lw =  8, '#4A5F6E', 1.2
            else:
                tick_len, color, lw =  5, '#354A5C', 1.0

            rad = math.radians(screen_deg)
            ca, sa = math.cos(rad), math.sin(rad)
            p.setPen(QPen(QColor(color), lw))
            p.drawLine(
                QPointF(cx + inner * ca,              cy + inner * sa),
                QPointF(cx + (inner - tick_len) * ca, cy + (inner - tick_len) * sa),
            )

            # bp label at cardinal ticks (0°, 90°, 180°, 270°)
            if is_cardinal:
                bp = int(round(i * 15 / 360 * self.model.length))
                label_r = inner - tick_len - 12
                lx = cx + label_r * ca
                ly = cy + label_r * sa
                font = QFont('Courier', 8)
                p.setFont(font)
                p.setPen(QPen(QColor('#546E7A')))
                fm = QFontMetrics(font)
                text = f'{bp:,}'
                tw = fm.horizontalAdvance(text)
                p.drawText(QRectF(lx - tw/2 - 2, ly - 8, tw + 4, 16),
                           Qt.AlignCenter, text)

    def _arc(self, p, cx, cy, r, start_deg, end_deg, color, width, selected=False):
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

            if feat.showArrow and not feat.showPromoter:
                eff_size = feat.arrowSize if feat.arrowSize > 0 else feat.lineWidth
                arrow_deg = ed if feat.strand == 1 else sd
                tan_deg = arrow_deg + (90 if feat.strand == 1 else -90)
                tan_rad = math.radians(tan_deg)
                base = self._pt(cx, cy, feat_r, arrow_deg)
                # Push tip past the arc end so arrow protrudes beyond the arc stroke
                tip = QPointF(base.x() + math.cos(tan_rad) * eff_size,
                              base.y() + math.sin(tan_rad) * eff_size)
                self._arrowhead(p, tip, tan_deg, color, size=eff_size)

            if feat.showPromoter:
                prom_deg = sd if feat.strand == 1 else ed
                self._promoter_symbol(p, cx, cy, outer, prom_deg, color,
                                      dir_cw=(feat.strand == 1))

            mid_deg = self._bp_to_deg((feat.start + feat.end) / 2)
            self._feature_label(p, cx, cy, outer, feat_r, feat_hw,
                                mid_deg, feat.name, color, sel)

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
        # Inverse zoom transform so hit-testing works at any zoom level
        cxw, cyw = self.width() / 2, self.height() / 2
        pos = QPointF((pos.x() - cxw) / self._zoom + cxw,
                      (pos.y() - cyw) / self._zoom + cyw)
        cx, cy, outer, inner, feat_hw, _ = self._geo()
        feat_r = outer + feat_hw * 0.3
        dx, dy = pos.x()-cx, pos.y()-cy
        dist   = math.hypot(dx, dy)
        click_deg = math.degrees(math.atan2(dy, dx))

        # 1. Feature handles have highest priority — always grabbable even when
        #    a restriction site occupies the same angular position.
        if abs(dist - feat_r) < 18:
            for feat in reversed(self.model.features):
                sd = self._bp_to_deg(feat.start)
                ed = self._bp_to_deg(feat.end)
                for handle, deg in [('start', sd), ('end', ed)]:
                    pt = self._pt(cx, cy, feat_r, deg)
                    if math.hypot(pos.x()-pt.x(), pos.y()-pt.y()) < 12:
                        return feat, handle

        # 2. Restriction site ticks
        if abs(dist - (outer + feat_hw*0.5)) < 18:
            best, best_diff = None, 8.0
            for site in self.model.cut_sites:
                site_deg = self._bp_to_deg(site.position)
                diff = abs(((click_deg - site_deg + 180) % 360) - 180)
                if diff < best_diff:
                    best, best_diff = site, diff
            if best:
                return best, 'pos'

        # 3. Feature arc bodies
        if abs(dist - feat_r) < 14:
            for feat in reversed(self.model.features):
                sd = self._bp_to_deg(feat.start)
                ed = self._bp_to_deg(feat.end)
                span = (ed - sd) % 360.0
                rel  = (click_deg - sd) % 360.0
                if rel <= span:
                    return feat, 'body'

        return None, None

    # ------------------------------------------------------------------
    # Mouse
    # ------------------------------------------------------------------

    def mousePressEvent(self, event):
        if not self._interactive:
            return
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
        if not self._interactive:
            return
        if self._drag_handle:
            handle, feat = self._drag_handle
            cx, cy = self.width()/2, self.height()/2
            # Inverse zoom transform
            mx = (event.pos().x() - cx) / self._zoom + cx
            my = (event.pos().y() - cy) / self._zoom + cy
            dx, dy = mx - cx, my - cy
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
        if not self._interactive:
            return
        self._drag_handle = None

    def wheelEvent(self, event):
        if not self._interactive:
            return
        delta = event.angleDelta().y()
        factor = 1.15 if delta > 0 else 1 / 1.15
        self._zoom = max(0.4, min(5.0, self._zoom * factor))
        self.zoomChanged.emit(self._zoom)
        self.update()

    def _context_menu(self, gpos, item):
        menu = QMenu(self)
        edit_act = menu.addAction('Edit…')
        del_act  = menu.addAction('Delete')
        act = menu.exec_(gpos)
        ew = self._editor_widget()
        if act == edit_act and ew:
            if isinstance(item, Feature):
                ew.edit_feature(item)
            else:
                ew.edit_restriction_site(item)
        elif act == del_act:
            if isinstance(item, Feature) and item in self.model.features:
                self.model.features.remove(item)
            elif isinstance(item, RestrictionSite) and item in self.model.cut_sites:
                self.model.cut_sites.remove(item)
            self._selected = None
            self.featureSelected.emit(None)
            self.update()

    def _editor_widget(self):
        w = self.parent()
        while w and not hasattr(w, 'edit_feature'):
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
        self.arrow_size_s = QSpinBox(); self.arrow_size_s.setRange(0, 80)
        self.arrow_size_s.setSpecialValueText('auto (match arc width)')
        self.arrow_size_s.setValue(self._feat.arrowSize)
        layout.addRow('Arrow size (px):', self.arrow_size_s)
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
        f.arrowSize    = self.arrow_size_s.value()
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

        self.qe_group = QGroupBox('Selected')
        self.qe_layout = QFormLayout(self.qe_group)
        root.addWidget(self.qe_group)

        root.addStretch()
        self._refresh()

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
        ew = self.canvas._editor_widget()
        if isinstance(item, Feature) and ew:
            ew.edit_feature(item)
        elif isinstance(item, RestrictionSite) and ew:
            ew.edit_restriction_site(item)

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
# PlasmidEditorWidget
# ---------------------------------------------------------------------------

class PlasmidEditorWidget(QWidget):
    """Wraps PlasmidCanvas + PropertiesPanel in a horizontal splitter.

    Pass library + category to enable the library toolbar (Pick from Library,
    Reset to Base, Edit Base Plasmid toggle).
    """

    def __init__(self, library=None, category='donor', parent=None):
        super().__init__(parent)
        self._library  = library
        self._category = category
        self._base_id  = ''
        self._edit_base_mode    = False
        self._frozen_level_model: Optional[PlasmidModel] = None
        self._build()

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(2)

        # ---- Library toolbar (shown when library is set) ----
        self._lib_bar = QWidget()
        lib_layout = QHBoxLayout(self._lib_bar)
        lib_layout.setContentsMargins(6, 4, 6, 2)
        lib_layout.setSpacing(6)
        self._source_label = QLabel('Source: —')
        self._source_label.setStyleSheet('color: #90A4AE; font-size: 11px;')
        lib_layout.addWidget(self._source_label)
        lib_layout.addStretch()
        self._pick_btn = QPushButton('Pick from Library')
        self._pick_btn.setFixedWidth(130)
        self._pick_btn.clicked.connect(self._pick_from_library)
        lib_layout.addWidget(self._pick_btn)
        self._reset_btn = QPushButton('Reset to Base')
        self._reset_btn.setFixedWidth(110)
        self._reset_btn.setEnabled(False)
        self._reset_btn.clicked.connect(self._reset_to_base)
        lib_layout.addWidget(self._reset_btn)
        self._edit_base_cb = QCheckBox('Edit Base Plasmid')
        self._edit_base_cb.setToolTip(
            'When checked, edits modify the shared library entry.\n'
            'The level copy is not updated until you click "Reset to Base".')
        self._edit_base_cb.setEnabled(False)
        self._edit_base_cb.toggled.connect(self._on_edit_base_toggled)
        lib_layout.addWidget(self._edit_base_cb)
        self._lib_bar.setVisible(library is not None)
        root.addWidget(self._lib_bar)

        # ---- Edit-base mode banner ----
        self._edit_base_banner = QLabel(
            '  \u26a0  Editing shared library plasmid — '
            'level copy is frozen until "Reset to Base"')
        self._edit_base_banner.setStyleSheet(
            'background: #3D2E00; color: #FFB300; padding: 4px 8px; font-size: 11px;')
        self._edit_base_banner.setVisible(False)
        root.addWidget(self._edit_base_banner)

        # ---- pUC19 checkbox row (hidden by default, shown for vector tab) ----
        self._puc19_row = QWidget()
        row_layout = QHBoxLayout(self._puc19_row)
        row_layout.setContentsMargins(6, 4, 6, 0)
        self._puc19_cb = QCheckBox('Use built-in pUC19 (no custom vector)')
        self._puc19_cb.toggled.connect(self._on_puc19_toggled)
        row_layout.addWidget(self._puc19_cb)
        row_layout.addStretch()
        self._puc19_row.setVisible(False)
        root.addWidget(self._puc19_row)

        # ---- Zoom control strip ----
        zoom_bar = QWidget()
        zbl = QHBoxLayout(zoom_bar)
        zbl.setContentsMargins(6, 2, 6, 2)
        zbl.setSpacing(4)
        zbl.addStretch()
        zbl.addWidget(QLabel('Zoom:'))
        btn_out = QPushButton('−'); btn_out.setFixedWidth(26)
        btn_out.clicked.connect(lambda: self._zoom_step(-1))
        zbl.addWidget(btn_out)
        self._zoom_label = QLabel('100%')
        self._zoom_label.setFixedWidth(46)
        self._zoom_label.setAlignment(Qt.AlignCenter)
        zbl.addWidget(self._zoom_label)
        btn_in = QPushButton('+'); btn_in.setFixedWidth(26)
        btn_in.clicked.connect(lambda: self._zoom_step(1))
        zbl.addWidget(btn_in)
        btn_reset = QPushButton('1:1'); btn_reset.setFixedWidth(36)
        btn_reset.clicked.connect(self._zoom_reset)
        zbl.addWidget(btn_reset)
        zbl.addStretch()
        root.addWidget(zoom_bar)

        # ---- Canvas + props splitter ----
        self._splitter = QSplitter(Qt.Horizontal)
        self.canvas = PlasmidCanvas()
        self.canvas.zoomChanged.connect(self._on_zoom_changed)
        self._splitter.addWidget(self.canvas)

        self.props = PropertiesPanel(self.canvas)
        scroll = QScrollArea()
        scroll.setWidget(self.props)
        scroll.setWidgetResizable(True)
        scroll.setMinimumWidth(260)
        scroll.setMaximumWidth(300)
        self._splitter.addWidget(scroll)
        self._splitter.setStretchFactor(0, 3)
        self._splitter.setStretchFactor(1, 1)
        root.addWidget(self._splitter)

    # ------------------------------------------------------------------
    # Library toolbar
    # ------------------------------------------------------------------

    def _update_source_label(self):
        if not self._library:
            return
        if not self._base_id:
            self._source_label.setText('Source: — (custom)')
        else:
            entry = self._library.get_by_id(self._base_id)
            name  = entry.plasmid.name if entry else '(missing)'
            self._source_label.setText(f'Source: {name}')

    def _update_toolbar_state(self):
        has_base = bool(self._base_id) and self._library is not None
        self._reset_btn.setEnabled(has_base and not self._edit_base_mode)
        self._edit_base_cb.setEnabled(has_base)
        if not has_base:
            self._edit_base_cb.blockSignals(True)
            self._edit_base_cb.setChecked(False)
            self._edit_base_cb.blockSignals(False)

    def _pick_from_library(self):
        if self._library is None:
            return
        if self._edit_base_mode:
            self._edit_base_cb.setChecked(False)   # saves + exits edit-base first
        dlg = LibraryPickerDialog(self._library, self._category, self)
        if dlg.exec_() != QDialog.Accepted:
            return
        entry = dlg.selected_entry()
        if entry is None:
            # "Start from Scratch"
            self._base_id = ''
            self.canvas.model = PlasmidModel()
        else:
            self._base_id = entry.id
            self.canvas.model = deepcopy(entry.plasmid)
        self.canvas.model.base_id = ''   # stored via self._base_id
        self.canvas._selected = None
        self.props._refresh()
        self.canvas.update()
        self._update_source_label()
        self._update_toolbar_state()

    def _reset_to_base(self):
        if not self._base_id or self._library is None:
            return
        if self._edit_base_mode:
            self._edit_base_cb.setChecked(False)
        entry = self._library.get_by_id(self._base_id)
        if entry is None:
            QMessageBox.warning(self, 'Library Entry Not Found',
                f'Library entry "{self._base_id}" no longer exists.')
            return
        reply = QMessageBox.question(
            self, 'Reset to Base',
            f'Replace this level\'s plasmid with the library version of '
            f'"{entry.plasmid.name}"?\nLocal edits will be lost.',
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        if reply != QMessageBox.Yes:
            return
        self.canvas.model = deepcopy(entry.plasmid)
        self.canvas.model.base_id = ''
        self.canvas._selected = None
        self.props._refresh()
        self.canvas.update()

    def _on_edit_base_toggled(self, checked: bool):
        if checked:
            self._enter_edit_base_mode()
        else:
            self._exit_edit_base_mode()

    def _enter_edit_base_mode(self):
        if not self._base_id or self._library is None:
            self._edit_base_cb.blockSignals(True)
            self._edit_base_cb.setChecked(False)
            self._edit_base_cb.blockSignals(False)
            return
        entry = self._library.get_by_id(self._base_id)
        if entry is None:
            return
        self._frozen_level_model = deepcopy(self.canvas.model)
        self._frozen_level_model.base_id = self._base_id
        self.canvas.model = deepcopy(entry.plasmid)
        self.canvas._selected = None
        self._edit_base_mode = True
        self.props._refresh()
        self.canvas.update()
        self._edit_base_banner.setVisible(True)
        self._reset_btn.setEnabled(False)

    def _exit_edit_base_mode(self):
        if not self._edit_base_mode:
            return
        # Persist canvas state → library
        if self._library and self._base_id:
            self._library.update(self._base_id, self.canvas.model)
            self._library.save(backup=False)
        # Restore frozen level copy
        if self._frozen_level_model is not None:
            self.canvas.model = self._frozen_level_model
            self._frozen_level_model = None
        self._edit_base_mode = False
        self.props._refresh()
        self.canvas.update()
        self._edit_base_banner.setVisible(False)
        self._update_toolbar_state()

    # ------------------------------------------------------------------
    # Zoom helpers
    # ------------------------------------------------------------------

    def _zoom_step(self, direction: int):
        factor = 1.25 if direction > 0 else 1 / 1.25
        self.canvas._zoom = max(0.4, min(5.0, self.canvas._zoom * factor))
        self._on_zoom_changed(self.canvas._zoom)
        self.canvas.update()

    def _zoom_reset(self):
        self.canvas._zoom = 1.0
        self._on_zoom_changed(1.0)
        self.canvas.update()

    def _on_zoom_changed(self, zoom: float):
        self._zoom_label.setText(f'{zoom * 100:.0f}%')

    # ------------------------------------------------------------------
    # pUC19 toggle
    # ------------------------------------------------------------------

    def _on_puc19_toggled(self, checked: bool):
        self._splitter.setEnabled(not checked)
        if self._library is not None:
            self._lib_bar.setEnabled(not checked)

    def enable_puc19_toggle(self, visible: bool):
        self._puc19_row.setVisible(visible)

    def set_use_puc19(self, value: bool):
        self._puc19_cb.blockSignals(True)
        self._puc19_cb.setChecked(value)
        self._puc19_cb.blockSignals(False)
        self._splitter.setEnabled(not value)
        if self._library is not None:
            self._lib_bar.setEnabled(not value)

    def get_use_puc19(self) -> bool:
        return self._puc19_cb.isChecked()

    # ------------------------------------------------------------------
    # Load / get plasmid
    # ------------------------------------------------------------------

    def load_plasmid(self, model: PlasmidModel):
        # Exit edit-base mode silently (no library save — caller owns the data)
        if self._edit_base_mode:
            self._edit_base_mode = False
            self._frozen_level_model = None
            self._edit_base_banner.setVisible(False)
            self._edit_base_cb.blockSignals(True)
            self._edit_base_cb.setChecked(False)
            self._edit_base_cb.blockSignals(False)
        self._base_id = model.base_id
        self.canvas.model = deepcopy(model)
        self.canvas.model.base_id = ''   # keep base_id only in self._base_id
        self.canvas._selected = None
        self.props._refresh()
        self.canvas.update()
        if self._library is not None:
            self._update_source_label()
            self._update_toolbar_state()

    def get_plasmid(self) -> PlasmidModel:
        """Return the level's copy of the plasmid (frozen copy if in edit-base mode)."""
        if self._edit_base_mode and self._frozen_level_model is not None:
            m = deepcopy(self._frozen_level_model)
        else:
            m = deepcopy(self.canvas.model)
        m.base_id = self._base_id
        return m

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
# LibraryPickerDialog
# ---------------------------------------------------------------------------

class LibraryPickerDialog(QDialog):
    """Pick a plasmid from the library, or start from scratch."""

    def __init__(self, library: PlasmidLibrary, category: str, parent=None):
        super().__init__(parent)
        self.setWindowTitle(f'Pick from Library — {category.title()}s')
        self.setMinimumSize(820, 560)
        self._library  = library
        self._category = category
        self._selected: Optional[LibraryEntry] = None
        self._build()

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(10, 10, 10, 10)
        root.setSpacing(8)

        splitter = QSplitter(Qt.Horizontal)

        # Left: entry list
        left = QWidget()
        lv = QVBoxLayout(left)
        lv.setContentsMargins(0, 0, 0, 0)
        lv.addWidget(QLabel(f'Available {self._category}s:'))
        self._list = QListWidget()
        self._list.currentRowChanged.connect(self._on_row_changed)
        self._list.itemDoubleClicked.connect(lambda _: self._on_pick())
        lv.addWidget(self._list)
        splitter.addWidget(left)

        # Right: read-only preview canvas
        right = QWidget()
        rv = QVBoxLayout(right)
        rv.setContentsMargins(0, 0, 0, 0)
        rv.addWidget(QLabel('Preview:'))
        self._preview = PlasmidCanvas(interactive=False)
        self._preview.setMinimumSize(420, 420)
        rv.addWidget(self._preview)
        splitter.addWidget(right)

        splitter.setSizes([220, 580])
        root.addWidget(splitter)

        # Buttons
        btn_row = QHBoxLayout()
        self._pick_btn = QPushButton('Pick Selected')
        self._pick_btn.setEnabled(False)
        self._pick_btn.clicked.connect(self._on_pick)
        scratch_btn = QPushButton('Start from Scratch')
        scratch_btn.clicked.connect(self._on_scratch)
        cancel_btn = QPushButton('Cancel')
        cancel_btn.clicked.connect(self.reject)
        btn_row.addWidget(self._pick_btn)
        btn_row.addWidget(scratch_btn)
        btn_row.addStretch()
        btn_row.addWidget(cancel_btn)
        root.addLayout(btn_row)

        # Populate list
        entries = self._library.get_all(self._category)
        for e in entries:
            item = QListWidgetItem(f'{e.plasmid.name}  ({e.plasmid.length:,} bp)')
            item.setData(Qt.UserRole, e.id)
            self._list.addItem(item)
        if entries:
            self._list.setCurrentRow(0)

    def _on_row_changed(self, row):
        entries = self._library.get_all(self._category)
        if 0 <= row < len(entries):
            self._selected = entries[row]
            self._preview.model = deepcopy(entries[row].plasmid)
            self._preview.update()
            self._pick_btn.setEnabled(True)
        else:
            self._selected = None
            self._pick_btn.setEnabled(False)

    def _on_pick(self):
        if self._selected is not None:
            self.accept()

    def _on_scratch(self):
        self._selected = None
        self.accept()

    def selected_entry(self) -> Optional[LibraryEntry]:
        return self._selected


# ---------------------------------------------------------------------------
# LibraryManagerDialog
# ---------------------------------------------------------------------------

class LibraryManagerDialog(QDialog):
    """Manage the shared plasmid library (add, edit, delete entries)."""

    def __init__(self, library: PlasmidLibrary, parent=None):
        super().__init__(parent)
        self.setWindowTitle('Plasmid Library Manager')
        self.setMinimumSize(1050, 660)
        self._library = library
        # Per-category state: (list_widget, editor_widget, current_id_ref)
        self._vec_current_id: Optional[str] = None
        self._don_current_id: Optional[str] = None
        self._build()

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(8, 8, 8, 8)
        root.setSpacing(6)

        self._tabs = QTabWidget()
        self._tabs.addTab(self._build_category_tab('vector'), 'Vectors')
        self._tabs.addTab(self._build_category_tab('donor'),  'Donors')
        root.addWidget(self._tabs)

        close_btn = QPushButton('Save && Close')
        close_btn.setFixedWidth(120)
        close_btn.clicked.connect(self.accept)
        row = QHBoxLayout()
        row.addStretch()
        row.addWidget(close_btn)
        root.addLayout(row)

    def _build_category_tab(self, category: str) -> QWidget:
        tab = QWidget()
        h = QHBoxLayout(tab)
        h.setContentsMargins(4, 4, 4, 4)
        h.setSpacing(6)

        # Left: list + CRUD buttons
        left = QWidget()
        left.setMaximumWidth(230)
        lv = QVBoxLayout(left)
        lv.setContentsMargins(0, 0, 0, 0)
        lv.setSpacing(4)

        lst = QListWidget()
        lv.addWidget(lst)

        btn_row = QHBoxLayout()
        new_btn = QPushButton('New');   new_btn.setFixedWidth(50)
        dup_btn = QPushButton('Dup');   dup_btn.setFixedWidth(50)
        del_btn = QPushButton('Delete')
        for b in [new_btn, dup_btn, del_btn]:
            btn_row.addWidget(b)
        lv.addLayout(btn_row)
        h.addWidget(left)

        # Right: editor (no library toolbar — always editing library directly)
        editor = PlasmidEditorWidget()
        h.addWidget(editor)

        # Store refs on the tab widget for access in slots
        tab._list     = lst
        tab._editor   = editor
        tab._category = category

        # Wire list selection
        lst.currentRowChanged.connect(
            lambda row, t=tab: self._on_list_row_changed(t, row))

        # Wire CRUD buttons
        new_btn.clicked.connect(lambda _, t=tab: self._new_entry(t))
        dup_btn.clicked.connect(lambda _, t=tab: self._dup_entry(t))
        del_btn.clicked.connect(lambda _, t=tab: self._del_entry(t))

        self._refresh_list(tab)
        return tab

    # ---- helpers ----

    def _current_id(self, tab) -> Optional[str]:
        return (self._vec_current_id
                if tab._category == 'vector' else self._don_current_id)

    def _set_current_id(self, tab, id_val: Optional[str]):
        if tab._category == 'vector':
            self._vec_current_id = id_val
        else:
            self._don_current_id = id_val

    def _refresh_list(self, tab, select_id: str = None):
        entries = self._library.get_all(tab._category)
        tab._list.blockSignals(True)
        tab._list.clear()
        select_row = 0
        for i, e in enumerate(entries):
            item = QListWidgetItem(f'{e.plasmid.name}  ({e.plasmid.length:,} bp)')
            item.setData(Qt.UserRole, e.id)
            tab._list.addItem(item)
            if e.id == select_id:
                select_row = i
        tab._list.blockSignals(False)
        if entries:
            tab._list.setCurrentRow(select_row)
            self._load_entry_into_editor(tab, entries[select_row])
        else:
            self._set_current_id(tab, None)

    def _save_current_entry(self, tab):
        cid = self._current_id(tab)
        if cid is not None:
            self._library.update(cid, tab._editor.get_plasmid())

    def _load_entry_into_editor(self, tab, entry: LibraryEntry):
        self._set_current_id(tab, entry.id)
        tab._editor.load_plasmid(entry.plasmid)

    def _on_list_row_changed(self, tab, row: int):
        self._save_current_entry(tab)
        entries = self._library.get_all(tab._category)
        if 0 <= row < len(entries):
            self._load_entry_into_editor(tab, entries[row])
        else:
            self._set_current_id(tab, None)

    def _new_entry(self, tab):
        self._save_current_entry(tab)
        label = 'Vector' if tab._category == 'vector' else 'Donor'
        pm = PlasmidModel(name=f'New {label}')
        new_id = self._library.add(tab._category, pm)
        self._refresh_list(tab, select_id=new_id)

    def _dup_entry(self, tab):
        cid = self._current_id(tab)
        if cid is None:
            return
        self._save_current_entry(tab)
        entry = self._library.get_by_id(cid)
        if not entry:
            return
        pm = deepcopy(entry.plasmid)
        pm.name += ' (copy)'
        new_id = self._library.add(tab._category, pm)
        self._refresh_list(tab, select_id=new_id)

    def _del_entry(self, tab):
        cid = self._current_id(tab)
        if cid is None:
            return
        entry = self._library.get_by_id(cid)
        if not entry:
            return
        reply = QMessageBox.question(
            self, 'Delete Entry',
            f'Delete "{entry.plasmid.name}" from the library?\n'
            'Levels using it as their base will keep their own copies.',
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        if reply != QMessageBox.Yes:
            return
        self._library.delete(cid)
        self._set_current_id(tab, None)
        self._refresh_list(tab)

    def accept(self):
        # Save whatever is currently displayed in each tab
        for i in range(self._tabs.count()):
            tab = self._tabs.widget(i)
            if hasattr(tab, '_editor'):
                self._save_current_entry(tab)
        self._library.save()
        super().accept()

    def reject(self):
        self.accept()


# ---------------------------------------------------------------------------
# LevelSettingsPanel
# ---------------------------------------------------------------------------

def _populate_enzyme_list(list_widget: QListWidget, enzymes: list, checked: list):
    list_widget.clear()
    for enz in enzymes:
        item = QListWidgetItem(enz)
        item.setFlags(item.flags() | Qt.ItemIsUserCheckable)
        item.setCheckState(Qt.Checked if enz in checked else Qt.Unchecked)
        list_widget.addItem(item)


def _get_checked_enzymes(list_widget: QListWidget) -> list:
    result = []
    for i in range(list_widget.count()):
        item = list_widget.item(i)
        if item.checkState() == Qt.Checked:
            result.append(item.text())
    return result


class LevelSettingsPanel(QWidget):
    def __init__(self, on_refresh_objectives=None, parent=None):
        super().__init__(parent)
        self._on_refresh = on_refresh_objectives
        self._build()

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(8, 8, 8, 8)
        root.setSpacing(10)

        # ---- Level Info ----
        info_group = QGroupBox('Level Info')
        info_layout = QFormLayout(info_group)
        info_layout.setSpacing(6)

        self.id_edit = QLineEdit()
        info_layout.addRow('ID:', self.id_edit)

        self.title_edit = QLineEdit()
        info_layout.addRow('Title:', self.title_edit)

        self.desc_edit = QTextEdit()
        self.desc_edit.setMaximumHeight(75)
        info_layout.addRow('Description:', self.desc_edit)

        self.tp_edit = QTextEdit()
        self.tp_edit.setMaximumHeight(75)
        info_layout.addRow('Teaching Point:', self.tp_edit)

        self.seq_note_edit = QLineEdit()
        info_layout.addRow('Sequence Note:', self.seq_note_edit)

        root.addWidget(info_group)

        # ---- MCS Enzymes ----
        mcs_group = QGroupBox('MCS Enzymes')
        mcs_label = QLabel('(enzymes shown in game UI)')
        mcs_label.setStyleSheet('color: #90A4AE; font-size: 10px;')
        mcs_vl = QVBoxLayout(mcs_group)
        mcs_vl.addWidget(mcs_label)

        grid_widget = QWidget()
        grid = QGridLayout(grid_widget)
        grid.setSpacing(4)
        self._mcs_checkboxes = {}
        cols = 4
        for i, enz in enumerate(ENZYME_NAMES):
            cb = QCheckBox(enz)
            self._mcs_checkboxes[enz] = cb
            grid.addWidget(cb, i // cols, i % cols)
        mcs_vl.addWidget(grid_widget)
        root.addWidget(mcs_group)

        # ---- Objectives ----
        obj_group = QGroupBox('Objectives')
        obj_layout = QVBoxLayout(obj_group)
        obj_layout.setSpacing(6)

        obj_layout.addWidget(QLabel('Required fragments (in ligation order):'))
        self._frags_list = QListWidget()
        self._frags_list.setMaximumHeight(110)
        obj_layout.addWidget(self._frags_list)

        # Add-fragment row: picker + orientation + Add button
        add_row = QHBoxLayout()
        self.frag_cb = QComboBox()
        add_row.addWidget(self.frag_cb)
        self.orient_cb = QComboBox()
        self.orient_cb.addItems(['forward', 'reverse', '(none / either)'])
        self.orient_cb.setFixedWidth(110)
        add_row.addWidget(self.orient_cb)
        add_frag_btn = QPushButton('+ Add')
        add_frag_btn.setFixedWidth(48)
        add_frag_btn.clicked.connect(self._add_frag_entry)
        add_row.addWidget(add_frag_btn)
        obj_layout.addLayout(add_row)

        # Remove / reorder row
        frag_ctrl_row = QHBoxLayout()
        rem_frag_btn = QPushButton('Remove')
        rem_frag_btn.clicked.connect(self._remove_frag_entry)
        up_frag_btn  = QPushButton('↑')
        up_frag_btn.setFixedWidth(30)
        up_frag_btn.clicked.connect(lambda: self._move_frag_entry(-1))
        dn_frag_btn  = QPushButton('↓')
        dn_frag_btn.setFixedWidth(30)
        dn_frag_btn.clicked.connect(lambda: self._move_frag_entry(1))
        frag_ctrl_row.addWidget(rem_frag_btn)
        frag_ctrl_row.addWidget(up_frag_btn)
        frag_ctrl_row.addWidget(dn_frag_btn)
        frag_ctrl_row.addStretch()
        obj_layout.addLayout(frag_ctrl_row)

        obj_layout.addWidget(QLabel('Vector enzymes player must use:'))
        self.vec_enz_list = QListWidget()
        self.vec_enz_list.setMaximumHeight(90)
        obj_layout.addWidget(self.vec_enz_list)

        obj_layout.addWidget(QLabel('Donor enzymes player must use:'))
        self.don_enz_list = QListWidget()
        self.don_enz_list.setMaximumHeight(90)
        obj_layout.addWidget(self.don_enz_list)

        refresh_btn = QPushButton('Refresh from plasmids')
        refresh_btn.clicked.connect(self._on_refresh_clicked)
        obj_layout.addWidget(refresh_btn)

        root.addWidget(obj_group)
        root.addStretch()

    def _on_refresh_clicked(self):
        if self._on_refresh:
            self._on_refresh()

    # ------------------------------------------------------------------

    def load(self, lm: LevelModel):
        self.id_edit.setText(lm.id)
        self.title_edit.setText(lm.title)
        self.desc_edit.setPlainText(lm.description)
        self.tp_edit.setPlainText(lm.teaching_point)
        self.seq_note_edit.setText(lm.sequence_note)

        for enz, cb in self._mcs_checkboxes.items():
            cb.setChecked(enz in lm.mcs_enzymes)

        obj = lm.objectives

        # Fragment picker options
        donor_feat_names = list(dict.fromkeys(
            f.name for don in lm.donors for f in don.features))
        self.frag_cb.blockSignals(True)
        self.frag_cb.clear()
        self.frag_cb.addItem('(none)')
        for name in donor_feat_names:
            self.frag_cb.addItem(name)
        self.frag_cb.blockSignals(False)

        # Required fragments list — prefer correct_fragments, fall back to correct_fragment
        self._frags_list.clear()
        if obj.correct_fragments:
            for entry in obj.correct_fragments:
                ori = entry.get('orientation', 'forward') or 'forward'
                self._frags_list.addItem(f"{entry['name']}  [{ori}]")
        elif obj.correct_fragment:
            ori = obj.correct_orientation or 'forward'
            self._frags_list.addItem(f"{obj.correct_fragment}  [{ori}]")

        # Enzyme lists — collect available enzymes from plasmids
        vec_enzymes = list(dict.fromkeys(s.enzyme for s in lm.vector.cut_sites))
        don_enzymes = list(dict.fromkeys(
            s.enzyme for don in lm.donors for s in don.cut_sites))
        _populate_enzyme_list(self.vec_enz_list, vec_enzymes, obj.vector_enzymes)
        _populate_enzyme_list(self.don_enz_list, don_enzymes, obj.donor_enzymes)

    def _parse_frag_entries(self):
        """Return list of {name, orientation} dicts from the list widget."""
        entries = []
        for i in range(self._frags_list.count()):
            text = self._frags_list.item(i).text()  # "Name  [forward]"
            if '[' in text:
                name = text[:text.rfind('[')].strip()
                ori  = text[text.rfind('[')+1:text.rfind(']')].strip()
            else:
                name, ori = text.strip(), 'forward'
            if name:
                entries.append({'name': name, 'orientation': ori if ori != '(none / either)' else None})
        return entries

    def _add_frag_entry(self):
        name = self.frag_cb.currentText()
        if not name or name == '(none)':
            return
        ori = self.orient_cb.currentText()
        self._frags_list.addItem(f"{name}  [{ori}]")

    def _remove_frag_entry(self):
        row = self._frags_list.currentRow()
        if row >= 0:
            self._frags_list.takeItem(row)

    def _move_frag_entry(self, direction: int):
        row = self._frags_list.currentRow()
        new_row = row + direction
        if row < 0 or not (0 <= new_row < self._frags_list.count()):
            return
        item = self._frags_list.takeItem(row)
        self._frags_list.insertItem(new_row, item)
        self._frags_list.setCurrentRow(new_row)

    def get(self) -> dict:
        entries = self._parse_frag_entries()
        # Legacy single-fragment fields for backward compat
        correct_fragment    = entries[0]['name']        if entries else None
        correct_orientation = entries[0]['orientation'] if entries else None

        return {
            'id':            self.id_edit.text().strip(),
            'title':         self.title_edit.text().strip(),
            'description':   self.desc_edit.toPlainText().strip(),
            'teaching_point': self.tp_edit.toPlainText().strip(),
            'sequence_note': self.seq_note_edit.text().strip(),
            'mcs_enzymes':   [enz for enz, cb in self._mcs_checkboxes.items() if cb.isChecked()],
            'objectives':    LevelObjectives(
                vector_enzymes      = _get_checked_enzymes(self.vec_enz_list),
                donor_enzymes       = _get_checked_enzymes(self.don_enz_list),
                correct_fragment    = correct_fragment,
                correct_orientation = correct_orientation,
                correct_fragments   = entries if len(entries) > 1 else [],
            ),
        }

    def update_objectives_options(self, feat_names: list, vec_enzymes: list, don_enzymes: list):
        cur_frag    = self.frag_cb.currentText()
        cur_vec_enz = _get_checked_enzymes(self.vec_enz_list)
        cur_don_enz = _get_checked_enzymes(self.don_enz_list)

        self.frag_cb.blockSignals(True)
        self.frag_cb.clear()
        self.frag_cb.addItem('(none)')
        for name in feat_names:
            self.frag_cb.addItem(name)
        if cur_frag in feat_names:
            self.frag_cb.setCurrentText(cur_frag)
        else:
            self.frag_cb.setCurrentIndex(0)
        self.frag_cb.blockSignals(False)

        _populate_enzyme_list(self.vec_enz_list, vec_enzymes, cur_vec_enz)
        _populate_enzyme_list(self.don_enz_list, don_enzymes, cur_don_enz)


# ---------------------------------------------------------------------------
# LevelListPanel
# ---------------------------------------------------------------------------

class LevelListPanel(QWidget):
    levelSelected = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumWidth(200)
        self.setMaximumWidth(240)
        self._build()

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(6, 6, 6, 6)
        root.setSpacing(6)

        lbl = QLabel('Levels')
        font = lbl.font()
        font.setBold(True)
        lbl.setFont(font)
        root.addWidget(lbl)

        self.level_list = QListWidget()
        self.level_list.currentRowChanged.connect(self._on_row_changed)
        root.addWidget(self.level_list)

        row1 = QHBoxLayout()
        self._new_btn = QPushButton('New')
        self._dup_btn = QPushButton('Duplicate')
        row1.addWidget(self._new_btn)
        row1.addWidget(self._dup_btn)
        root.addLayout(row1)

        row2 = QHBoxLayout()
        self._del_btn  = QPushButton('Delete')
        self._up_btn   = QPushButton('↑ Up')
        self._down_btn = QPushButton('↓ Down')
        row2.addWidget(self._del_btn)
        row2.addWidget(self._up_btn)
        row2.addWidget(self._down_btn)
        root.addLayout(row2)

    def _on_row_changed(self, row):
        if row >= 0:
            self.levelSelected.emit(row)

    def set_levels(self, levels: list, current_idx: int):
        self.level_list.blockSignals(True)
        self.level_list.clear()
        for lm in levels:
            self.level_list.addItem(f'{lm.id}  {lm.title}')
        if 0 <= current_idx < len(levels):
            self.level_list.setCurrentRow(current_idx)
        self.level_list.blockSignals(False)


# ---------------------------------------------------------------------------
# LevelEditorWindow
# ---------------------------------------------------------------------------

class LevelEditorWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('Level Editor — Restriction Cloning Game')
        self.resize(1300, 800)

        self._levels: List[LevelModel] = []
        self._current_idx: int = -1
        self._levels_file: Path = DEFAULT_LEVELS_FILE
        self._loading: bool = False
        self._library: PlasmidLibrary = PlasmidLibrary()   # populated in load_levels_file

        self._build_ui()
        self._build_menu()

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------

    def _build_ui(self):
        central = QWidget()
        vbox = QVBoxLayout(central)
        vbox.setContentsMargins(0, 0, 0, 0)
        vbox.setSpacing(0)

        # Top toolbar with Save All button
        toolbar_widget = QWidget()
        toolbar_widget.setFixedHeight(38)
        toolbar_widget.setStyleSheet('background: #1E2D3D;')
        tb_layout = QHBoxLayout(toolbar_widget)
        tb_layout.setContentsMargins(8, 4, 8, 4)
        save_btn = QPushButton('💾 Save All')
        save_btn.setFixedWidth(120)
        save_btn.clicked.connect(self.save_levels_file)
        tb_layout.addWidget(save_btn)
        tb_layout.addStretch()
        vbox.addWidget(toolbar_widget)

        # Main splitter
        outer_splitter = QSplitter(Qt.Horizontal)

        # Left: level list
        self.list_panel = LevelListPanel()
        self.list_panel.levelSelected.connect(self._on_level_selected)
        self.list_panel._new_btn.clicked.connect(self._new_level)
        self.list_panel._dup_btn.clicked.connect(self._duplicate_level)
        self.list_panel._del_btn.clicked.connect(self._delete_level)
        self.list_panel._up_btn.clicked.connect(lambda: self._move_level(-1))
        self.list_panel._down_btn.clicked.connect(lambda: self._move_level(1))
        outer_splitter.addWidget(self.list_panel)

        # Middle: tab widget with vector / donor editors
        self._tabs = QTabWidget()
        self.vector_editor = PlasmidEditorWidget(library=self._library, category='vector')
        self.vector_editor.enable_puc19_toggle(True)
        self._tabs.addTab(self.vector_editor, 'Vector')

        self.donor_editors = []  # populated by _rebuild_donor_tabs()
        self._rebuild_donor_tabs(initial_count=1)

        # Add / remove donor buttons sit in a small bar above/below the tab widget
        self._donor_btn_bar = QWidget()
        _dbl = QHBoxLayout(self._donor_btn_bar)
        _dbl.setContentsMargins(4, 2, 4, 2)
        _dbl.setSpacing(4)
        _btn_add_donor = QPushButton('+ Add Donor')
        _btn_add_donor.clicked.connect(self._add_donor_tab)
        _btn_rem_donor = QPushButton('− Remove Donor')
        _btn_rem_donor.clicked.connect(self._remove_donor_tab)
        _dbl.addWidget(_btn_add_donor)
        _dbl.addWidget(_btn_rem_donor)
        _dbl.addStretch()

        # Wrap tabs + donor bar in a vertical layout
        _tab_container = QWidget()
        _tab_vbox = QVBoxLayout(_tab_container)
        _tab_vbox.setContentsMargins(0, 0, 0, 0)
        _tab_vbox.setSpacing(0)
        _tab_vbox.addWidget(self._tabs)
        _tab_vbox.addWidget(self._donor_btn_bar)
        outer_splitter.addWidget(_tab_container)

        # Right: settings panel in scroll area
        self.settings_panel = LevelSettingsPanel(on_refresh_objectives=self._refresh_objectives)
        right_scroll = QScrollArea()
        right_scroll.setWidget(self.settings_panel)
        right_scroll.setWidgetResizable(True)
        right_scroll.setMinimumWidth(300)
        right_scroll.setMaximumWidth(330)
        outer_splitter.addWidget(right_scroll)

        outer_splitter.setSizes([220, 770, 310])

        vbox.addWidget(outer_splitter)
        self.setCentralWidget(central)

    def _rebuild_donor_tabs(self, initial_count=None):
        """Remove all donor tabs and recreate them from self.donor_editors."""
        while self._tabs.count() > 1:
            self._tabs.removeTab(1)
        if initial_count is not None:
            self.donor_editors = [
                PlasmidEditorWidget(library=self._library, category='donor')
                for _ in range(initial_count)
            ]
        for i, ed in enumerate(self.donor_editors):
            self._tabs.addTab(ed, f'Donor {i + 1}')

    def _add_donor_tab(self):
        self._save_current_to_model()
        new_ed = PlasmidEditorWidget(library=self._library, category='donor')
        self.donor_editors.append(new_ed)
        self._tabs.addTab(new_ed, f'Donor {len(self.donor_editors)}')
        self._tabs.setCurrentWidget(new_ed)
        if self._current_idx >= 0:
            self._levels[self._current_idx].donors.append(PlasmidModel(name='New Donor'))

    def _remove_donor_tab(self):
        if len(self.donor_editors) <= 1:
            QMessageBox.information(self, 'Cannot Remove',
                'A level must have at least one donor plasmid.')
            return
        self._save_current_to_model()
        idx = self._tabs.currentIndex() - 1  # -1 because Vector is tab 0
        if idx < 0:
            idx = len(self.donor_editors) - 1
        self.donor_editors.pop(idx)
        if self._current_idx >= 0:
            lm = self._levels[self._current_idx]
            if idx < len(lm.donors):
                lm.donors.pop(idx)
        self._rebuild_donor_tabs()
        self._tabs.setCurrentIndex(min(1, self._tabs.count() - 1))

    def _build_menu(self):
        mb = self.menuBar()
        fm = mb.addMenu('File')

        open_act = QAction('Open levels/cloning.json', self)
        open_act.setShortcut('Ctrl+O')
        open_act.triggered.connect(self._open_file_dialog)
        fm.addAction(open_act)

        save_act = QAction('Save All', self)
        save_act.setShortcut('Ctrl+S')
        save_act.triggered.connect(self.save_levels_file)
        fm.addAction(save_act)

        fm.addSeparator()

        quit_act = QAction('Quit', self)
        quit_act.triggered.connect(self.close)
        fm.addAction(quit_act)

        lm = mb.addMenu('Library')

        manage_act = QAction('Manage Library…', self)
        manage_act.triggered.connect(self._open_library_manager)
        lm.addAction(manage_act)

        lm.addSeparator()

        imp_vec_act = QAction('Import current vector to library', self)
        imp_vec_act.triggered.connect(lambda: self._import_to_library('vector'))
        lm.addAction(imp_vec_act)

        imp_don_act = QAction('Import current donor to library', self)
        imp_don_act.triggered.connect(lambda: self._import_to_library('donor'))
        lm.addAction(imp_don_act)

    # ------------------------------------------------------------------
    # File operations
    # ------------------------------------------------------------------

    def _open_file_dialog(self):
        path, _ = QFileDialog.getOpenFileName(self, 'Open levels file', '', 'JSON (*.json)')
        if path:
            self.load_levels_file(Path(path))

    def load_levels_file(self, path: Path):
        try:
            with open(path) as f:
                data = json.load(f)
            self._levels = [level_from_dict(d) for d in data]
            self._levels_file = path

            # Load (or create) the sibling library file, then migrate
            lib_path = path.parent / 'plasmid_library.json'
            self._library.load(lib_path)
            self._migrate_to_library()

            # Propagate updated library reference to existing vector editor
            self.vector_editor._library = self._library
            self.vector_editor._lib_bar.setVisible(True)

            self.statusBar().showMessage(str(path))
            if self._levels:
                self.list_panel.set_levels(self._levels, 0)
                self._load_level(0)
            else:
                self.list_panel.set_levels([], -1)
                self._current_idx = -1
        except Exception as e:
            QMessageBox.critical(self, 'Error opening file', str(e))

    def _migrate_to_library(self):
        """Assign base_ids to any plasmids that don't yet have one."""
        changed = False
        for lm in self._levels:
            if not lm.vector_use_puc19 and not lm.vector.base_id:
                lm.vector.base_id = self._library.find_or_add('vector', lm.vector)
                changed = True
            for donor in lm.donors:
                if not donor.base_id:
                    donor.base_id = self._library.find_or_add('donor', donor)
                    changed = True
        if changed:
            self._library.save()

    def save_levels_file(self):
        self._save_current_to_model()

        # Write backup
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        bak = self._levels_file.with_suffix(f'.bak_{ts}.json')
        try:
            if self._levels_file.exists():
                bak.write_text(self._levels_file.read_text())
        except Exception:
            pass

        try:
            out = [level_to_dict(lm) for lm in self._levels]
            with open(self._levels_file, 'w') as f:
                json.dump(out, f, indent=2)
            self.statusBar().showMessage(f'Saved: {self._levels_file}')
            QMessageBox.information(self, 'Saved',
                f'Levels saved to:\n{self._levels_file}\n\nBackup: {bak.name}')
        except Exception as e:
            QMessageBox.critical(self, 'Error saving file', str(e))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _save_current_to_model(self):
        if self._current_idx < 0 or self._current_idx >= len(self._levels):
            return
        lm = self._levels[self._current_idx]

        lm.vector_use_puc19 = self.vector_editor.get_use_puc19()
        lm.vector = self.vector_editor.get_plasmid()
        lm.donors = [ed.get_plasmid() for ed in self.donor_editors]

        info = self.settings_panel.get()
        lm.id            = info['id']
        lm.title         = info['title']
        lm.description   = info['description']
        lm.teaching_point = info['teaching_point']
        lm.sequence_note = info['sequence_note']
        lm.mcs_enzymes   = info['mcs_enzymes']
        lm.objectives    = info['objectives']

    def _load_level(self, idx: int):
        self._loading = True
        try:
            self._current_idx = idx
            lm = self._levels[idx]

            self.vector_editor.load_plasmid(lm.vector)
            self.vector_editor.set_use_puc19(lm.vector_use_puc19)

            # Rebuild donor tabs to match number of donors in the level
            self.donor_editors = [
                PlasmidEditorWidget(library=self._library, category='donor')
                for _ in lm.donors
            ]
            self._rebuild_donor_tabs()
            for ed, donor in zip(self.donor_editors, lm.donors):
                ed.load_plasmid(donor)

            self.settings_panel.load(lm)
            self._refresh_objectives()

            self.list_panel.set_levels(self._levels, idx)
        finally:
            self._loading = False

    def _on_level_selected(self, idx: int):
        if self._loading:
            return
        self._save_current_to_model()
        self._load_level(idx)

    def _refresh_objectives(self):
        vec_enzymes = list(dict.fromkeys(
            s.enzyme for s in self.vector_editor.canvas.model.cut_sites))
        don_enzymes = list(dict.fromkeys(
            s.enzyme
            for ed in self.donor_editors
            for s in ed.canvas.model.cut_sites))
        feat_names = list(dict.fromkeys(
            f.name
            for ed in self.donor_editors
            for f in ed.canvas.model.features))
        self.settings_panel.update_objectives_options(feat_names, vec_enzymes, don_enzymes)

    def _open_library_manager(self):
        self._save_current_to_model()
        dlg = LibraryManagerDialog(self._library, self)
        dlg.exec_()
        # Refresh source labels in the current level editors (names may have changed)
        self.vector_editor._update_source_label()
        for ed in self.donor_editors:
            ed._update_source_label()

    def _import_to_library(self, category: str):
        if category == 'vector':
            if self.vector_editor.get_use_puc19():
                QMessageBox.information(self, 'Import to Library',
                    'Cannot import pUC19 placeholder.\n'
                    'Uncheck "Use built-in pUC19" first.')
                return
            editor = self.vector_editor
        else:
            # Use currently visible donor tab, or first donor
            tab_idx = self._tabs.currentIndex() - 1
            if tab_idx < 0 or tab_idx >= len(self.donor_editors):
                tab_idx = 0
            if not self.donor_editors:
                return
            editor = self.donor_editors[tab_idx]

        plasmid = editor.get_plasmid()
        name, ok = QInputDialog.getText(self, 'Import to Library',
                                        'Library entry name:', text=plasmid.name)
        if not ok or not name.strip():
            return
        plasmid.name = name.strip()
        new_id = self._library.add(category, plasmid)
        self._library.save()
        editor._base_id = new_id
        editor._update_source_label()
        editor._update_toolbar_state()
        QMessageBox.information(self, 'Imported',
            f'"{plasmid.name}" added to library as a {category}.')

    def _new_level(self):
        self._save_current_to_model()
        existing_ids = {lm.id for lm in self._levels}
        n = 1
        while f'clone_{n:02d}' in existing_ids:
            n += 1
        new_id = f'clone_{n:02d}'
        lm = LevelModel(id=new_id, title='New Level')
        self._levels.append(lm)
        new_idx = len(self._levels) - 1
        self.list_panel.set_levels(self._levels, new_idx)
        self._load_level(new_idx)

    def _duplicate_level(self):
        if self._current_idx < 0:
            return
        self._save_current_to_model()
        dup = deepcopy(self._levels[self._current_idx])
        dup.id = dup.id + '_copy'
        insert_at = self._current_idx + 1
        self._levels.insert(insert_at, dup)
        self.list_panel.set_levels(self._levels, insert_at)
        self._load_level(insert_at)

    def _delete_level(self):
        if self._current_idx < 0 or not self._levels:
            return
        lm = self._levels[self._current_idx]
        reply = QMessageBox.question(
            self, 'Delete Level',
            f'Delete level "{lm.id}: {lm.title}"?\nThis cannot be undone.',
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        if reply != QMessageBox.Yes:
            return
        self._levels.pop(self._current_idx)
        if not self._levels:
            self._current_idx = -1
            self.list_panel.set_levels([], -1)
        else:
            new_idx = min(self._current_idx, len(self._levels) - 1)
            self.list_panel.set_levels(self._levels, new_idx)
            self._load_level(new_idx)

    def _move_level(self, delta: int):
        if self._current_idx < 0:
            return
        new_idx = self._current_idx + delta
        if new_idx < 0 or new_idx >= len(self._levels):
            return
        self._save_current_to_model()
        levels = self._levels
        levels[self._current_idx], levels[new_idx] = levels[new_idx], levels[self._current_idx]
        self._current_idx = new_idx
        self.list_panel.set_levels(levels, new_idx)


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
    win = LevelEditorWindow()
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_LEVELS_FILE
    if path.exists():
        win.load_levels_file(path)
    win.show()
    sys.exit(app.exec_())


if __name__ == '__main__':
    main()
