PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS bom_items;
DROP TABLE IF EXISTS material_lists;

CREATE TABLE material_lists (
  material_list_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  style_no                TEXT NOT NULL,
  total_qty               INTEGER,
  factory                 TEXT,
  buyer                   TEXT,
  ds                      TEXT,
  created_date             TEXT,
  updated_date             TEXT,
  first_ship_date          TEXT,
  rdd_date                 TEXT,
  label_order_buffer_pct   REAL,
  source_excel_file        TEXT,
  source_sheet_name        TEXT,
  created_at               TEXT DEFAULT (datetime('now')),
  updated_at               TEXT DEFAULT (datetime('now'))
);

CREATE TABLE bom_items (
  bom_item_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  material_list_id      INTEGER NOT NULL,
  row_order             INTEGER,
  item_name             TEXT,
  qty_total             INTEGER,
  color_of_outshell     TEXT,
  color_used            TEXT,
  unit_spec             TEXT,
  per_pack              TEXT,
  consumption_rate      REAL,
  consumption_unit      TEXT,
  required_amount       REAL,
  order_date            TEXT,
  order_qty             REAL,
  supplier              TEXT,
  unit_price            REAL,
  composition_weight    TEXT,
  remark                TEXT,
  FOREIGN KEY (material_list_id) REFERENCES material_lists(material_list_id) ON DELETE CASCADE
);

INSERT INTO material_lists (material_list_id, style_no, source_excel_file, created_at, updated_at)
SELECT id, code, 'MIGRATED_FROM_ITEMS', createdAt, updatedAt FROM items;

INSERT INTO bom_items (material_list_id, row_order, item_name, consumption_unit, unit_spec, supplier, composition_weight, remark)
SELECT id, 1, name, unit, spec, vendor, composition, description FROM items;

PRAGMA foreign_keys = ON;