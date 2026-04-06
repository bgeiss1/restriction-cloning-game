/**
 * vi_p1_zones.js — Phase 1 environmental zone detection + air current forces.
 *
 * Stateless helpers called every tick by P1Droplet.
 *
 * Zones implemented:
 *   UV ZONE   — two sunbeam shafts from left-wall windows (UV_ZONE_A/B)
 *   DRY ZONE  — HVAC supply downward cone from ceiling vent
 *   WARM AIR  — ceiling layer (Y > WARM_ZONE_Y_MIN)
 *   COOL AIR  — near left wall + floor corner
 *   HUMID     — sphere around teacher's desk humidifier (DI recovery)
 *
 * Air currents implemented:
 *   HVAC supply  — downward blast + radial outward near ceiling vent
 *   HVAC return  — rightward pull near right-wall return vent
 *   Window draft — gentle rightward cross-breeze in left half of room
 *   Thermal      — weak upward convection in ceiling warm layer
 *
 * API (no init/destroy — pure functions):
 *   P1Zones.getZoneState(pos) → { evapRate, viabExtraDecay, zoneName }
 *   P1Zones.getAirForce(pos)  → { fx, fy }   (units/sec², scaled by proximity)
 */

/* global P1_CFG, P1Students */

const P1Zones = (() => {

  // ── Zone tests ─────────────────────────────────────────────────────────────

  function _inUvZone(pos) {
    for (const z of [P1_CFG.UV_ZONE_A, P1_CFG.UV_ZONE_B]) {
      if (pos.x >= z.floorXStart && pos.x <= z.floorXEnd &&
          pos.y >= z.yBot        && pos.y <= z.yTop       &&
          pos.z >= z.anchorZ - z.zHalfWidth &&
          pos.z <= z.anchorZ + z.zHalfWidth) {
        return true;
      }
    }
    return false;
  }

  // HVAC supply vent dry cone — axis points straight down from supply pos.
  function _inDryCone(pos) {
    const sp = P1_CFG.HVAC_SUPPLY_POS;
    const axisComp = sp.y - pos.y;       // positive = below supply
    if (axisComp < 0 || axisComp > P1_CFG.DRY_CONE_LENGTH) return false;
    const perp = Math.sqrt(
      (pos.x - sp.x) * (pos.x - sp.x) +
      (pos.z - sp.z) * (pos.z - sp.z)
    );
    return (Math.atan2(perp, axisComp) * 180 / Math.PI) < P1_CFG.DRY_CONE_HALF_ANGLE;
  }

  function _inHumidZone(pos) {
    const c  = P1_CFG.HUMID_ZONE_CENTER;
    const dx = pos.x - c.x, dy = pos.y - c.y, dz = pos.z - c.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) < P1_CFG.HUMID_ZONE_RADIUS;
  }

  function _inWarmZone(pos) {
    return pos.y > P1_CFG.WARM_ZONE_Y_MIN;
  }

  function _inCoolZone(pos) {
    return pos.x < P1_CFG.COOL_ZONE_X_MAX && pos.y < P1_CFG.COOL_ZONE_Y_MAX;
  }

  // ── Public: zone state ─────────────────────────────────────────────────────

  /**
   * Returns zone modifiers for the droplet's current position.
   *
   * evapRate      — net DI change in %/sec (positive = loss, negative = recovery)
   * viabExtraDecay — extra VV loss in %/sec on top of VIAB_BASE_DECAY
   * zoneName      — string key for HUD indicator, or null
   */
  function getZoneState(pos) {
    const uv    = _inUvZone(pos);
    const dry   = _inDryCone(pos);
    const warm  = _inWarmZone(pos);
    const cool  = _inCoolZone(pos);
    const humid = _inHumidZone(pos);

    // Evaporation rate — humid overrides all (DI recovery); otherwise use
    // worst applicable multiplier (dry > warm > cool > normal).
    let evapRate;
    if (humid) {
      evapRate = P1_CFG.EVAP_HUMID_RATE;                              // negative
    } else if (dry) {
      evapRate = P1_CFG.EVAP_BASE_RATE * P1_CFG.EVAP_DRY_MULT;      // 7.5 %/s
    } else if (warm) {
      evapRate = P1_CFG.EVAP_BASE_RATE * P1_CFG.EVAP_WARM_MULT;     // 6.5 %/s
    } else if (cool) {
      evapRate = P1_CFG.EVAP_BASE_RATE * P1_CFG.EVAP_COOL_MULT;     // 4.0 %/s
    } else {
      evapRate = P1_CFG.EVAP_BASE_RATE;                               // 5.0 %/s
    }

    // Extra viability decay — additive; UV + warm can stack.
    let viabExtraDecay = 0;
    if (uv)   viabExtraDecay += P1_CFG.VIAB_UV_DAMAGE;
    if (warm) viabExtraDecay += P1_CFG.VIAB_WARM_DAMAGE;

    // HUD zone name — worst hazard takes precedence.
    let zoneName = null;
    if (uv)          zoneName = 'UV ZONE';
    else if (dry)    zoneName = 'DRY ZONE';
    else if (warm)   zoneName = 'WARM AIR';
    else if (humid)  zoneName = 'HUMID';
    else if (cool)   zoneName = 'COOL AIR';

    return { evapRate, viabExtraDecay, zoneName };
  }

  // ── Public: air force ──────────────────────────────────────────────────────

  /**
   * Returns net air current force in X and Y (units/s per second).
   * Multiply by dt and add to velocity each frame.
   * Z force intentionally omitted — forward speed is fixed.
   */
  function getAirForce(pos) {
    let fx = 0, fy = 0;

    // ── HVAC supply (ceiling vent at HVAC_SUPPLY_POS) ──────────────────────
    // Downward blast + radial outward within HVAC_SUPPLY_RADIUS sphere.
    {
      const sp  = P1_CFG.HVAC_SUPPLY_POS;
      const dx  = pos.x - sp.x;
      const dy  = pos.y - sp.y;
      const dz  = pos.z - sp.z;
      const d3  = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d3 < P1_CFG.HVAC_SUPPLY_RADIUS) {
        const t   = 1 - d3 / P1_CFG.HVAC_SUPPLY_RADIUS;  // 1 = at vent, 0 = edge
        fy += P1_CFG.HVAC_SUPPLY_FORCE_Y * t;             // downward
        const d2 = Math.sqrt(dx * dx + dz * dz);
        if (d2 > 0.01) {
          fx += (dx / d2) * P1_CFG.HVAC_SUPPLY_FORCE_X * t;   // radial outward X
        }
      }
    }

    // ── HVAC return (right-wall vent at HVAC_RETURN_POS) ──────────────────
    // Rightward suction within HVAC_RETURN_RADIUS sphere.
    {
      const rp = P1_CFG.HVAC_RETURN_POS;
      const dx = pos.x - rp.x;
      const dy = pos.y - rp.y;
      const dz = pos.z - rp.z;
      const d  = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < P1_CFG.HVAC_RETURN_RADIUS) {
        const t = 1 - d / P1_CFG.HVAC_RETURN_RADIUS;
        fx += P1_CFG.HVAC_RETURN_FORCE_X * t;   // rightward (+X)
      }
    }

    // ── Window draft — rightward cross-breeze in left half of room ─────────
    if (pos.x < P1_CFG.WINDOW_DRAFT_X_THRESH) {
      fx += P1_CFG.WINDOW_DRAFT_FORCE_X;
    }

    // ── Thermal convection — weak upward lift in warm ceiling layer ────────
    if (pos.y > P1_CFG.WARM_ZONE_Y_MIN) {
      fy += P1_CFG.THERMAL_CONVECT_FORCE;
    }

    // ── Student body heat — upward plume above each seated student ─────────
    {
      const students = P1Students.getStudentPositions();
      const sr = P1_CFG.STUDENT_THERMAL_RADIUS;
      for (const sp of students) {
        const dx = pos.x - sp.x;
        const dz = pos.z - sp.z;
        const d2 = Math.sqrt(dx * dx + dz * dz);
        if (d2 < sr && pos.y > P1_CFG.HEAD_Y - 0.1) {
          fy += P1_CFG.STUDENT_THERMAL_FORCE * (1 - d2 / sr);
        }
      }
    }

    return { fx, fy };
  }

  return { getZoneState, getAirForce };

})();
