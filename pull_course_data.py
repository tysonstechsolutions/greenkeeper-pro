"""
Pull live course data from Supabase and print a summary.
Run this first to see what data is available before the PDF is rebuilt.
"""
import requests, json

URL  = "https://mbgublyqnyghmvqfooao.supabase.co/rest/v1"
KEY  = "sb_secret_x7w4-frjfSdYuAMZ8TXJMg_v7j-xij6"

HEADERS = {
    "apikey":        KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "count=exact",
}

def get(table, params=None):
    r = requests.get(f"{URL}/{table}", headers=HEADERS, params=params or {})
    if r.status_code in (200, 206):
        return r.json()
    print(f"  ERROR {r.status_code} on {table}: {r.text[:200]}")
    return []

# ── Course map: hole observations ─────────────────────────────────────────────
print("\n=== HOLE OBSERVATIONS (open/in_progress/monitoring) ===")
hole_obs = get("hole_observations", {
    "select": "hole_number,issue_type,priority,status,title,description,created_at",
    "status": "neq.resolved",
    "order":  "hole_number.asc,priority.asc",
})
for o in hole_obs:
    print(f"  Hole {o.get('hole_number','?'):>2}  [{o.get('priority','?').upper():8}]  "
          f"{o.get('issue_type','?'):25}  status={o.get('status','?')}")
    if o.get('title'):
        print(f"           \"{o['title']}\"")
print(f"  Total: {len(hole_obs)}")

# ── Course map: green observations ────────────────────────────────────────────
print("\n=== GREEN OBSERVATIONS (open/in_progress/monitoring) ===")
green_obs = get("green_observations", {
    "select": "hole_number,issue_type,priority,status,title,description,created_at",
    "status": "neq.resolved",
    "order":  "hole_number.asc,priority.asc",
})
for o in green_obs:
    print(f"  Green {o.get('hole_number','?'):>2}  [{o.get('priority','?').upper():8}]  "
          f"{o.get('issue_type','?'):25}  status={o.get('status','?')}")
    if o.get('title'):
        print(f"           \"{o['title']}\"")
print(f"  Total: {len(green_obs)}")

# ── FY26 Asset inventory ──────────────────────────────────────────────────────
print("\n=== FY26 ASSETS ===")
assets = get("fy26_assets", {
    "select": "site,asset_number,description,qty,status,original_value,model_text,manufacturer,serial_number",
    "order":  "site.asc,asset_number.asc",
})
by_site   = {}
by_status = {}
for a in assets:
    s = a.get("site", "unknown")
    st = a.get("status", "unknown")
    by_site.setdefault(s, []).append(a)
    by_status[st] = by_status.get(st, 0) + 1

for site, items in sorted(by_site.items()):
    label = "Golf Course (7009)" if site == "7009" else f"Maintenance Facility ({site})"
    print(f"\n  Site: {label}  ({len(items)} items)")
    for a in items[:60]:  # cap display
        val = f"${a['original_value']:,.0f}" if a.get("original_value") else "  N/A  "
        print(f"    {a.get('asset_number',''):12} {a.get('description',''):45} "
              f"qty={a.get('qty',1)}  val={val}  status={a.get('status','?')}")

print(f"\n  Status breakdown:")
for st, count in sorted(by_status.items()):
    print(f"    {st:25} {count}")
print(f"  Grand total: {len(assets)}")

# ── Equipment ─────────────────────────────────────────────────────────────────
print("\n=== EQUIPMENT ===")
equip = get("equipment", {
    "select": "name,equipment_type,status,make,model,year,current_hours,condition_status",
    "status": "neq.retired",
    "order":  "equipment_type.asc,name.asc",
})
for e in equip:
    hrs = f"{e['current_hours']:.0f}h" if e.get('current_hours') else "  —"
    print(f"  [{e.get('status','?'):15}] {e.get('name','?'):35} "
          f"{e.get('equipment_type','?'):20} {hrs}")
print(f"  Total: {len(equip)}")

# ── Parking lot issues ────────────────────────────────────────────────────────
print("\n=== PARKING LOT ISSUES ===")
parking = get("parking_lot_issues", {
    "select": "issue_type,severity,status,description,created_at",
    "status": "neq.resolved",
    "order":  "severity.desc",
})
for p in parking:
    print(f"  [{p.get('severity','?').upper():8}] {p.get('issue_type','?'):20}  status={p.get('status','?')}")
print(f"  Total: {len(parking)}")

# ── Clubhouse issues ──────────────────────────────────────────────────────────
print("\n=== CLUBHOUSE ISSUES ===")
clubhouse = get("clubhouse_issues", {
    "select": "category,priority,status,title,description,created_at",
    "status": "neq.completed",
    "order":  "priority.desc",
})
for c in clubhouse:
    print(f"  [{c.get('priority','?').upper():8}] {c.get('category','?'):15}  "
          f"{c.get('title') or c.get('description','')[:50]}")
print(f"  Total: {len(clubhouse)}")
