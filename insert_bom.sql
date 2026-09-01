BEGIN TRANSACTION;

INSERT INTO material_lists (style_no, total_qty, factory, buyer)
VALUES ('MB62SLM103Z', 0, '미센스', '미센스');

INSERT INTO bom_items (material_list_id, row_order, item_name, consumption_unit, unit_spec, supplier, composition_weight, remark)
VALUES (last_insert_rowid(), 1, '원단', 'Y', '58"', '공급처_정보', '혼용률_정보', '비고_없음');

COMMIT;
