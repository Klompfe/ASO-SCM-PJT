# Data Mapping Specification (Misense Material List)

## 1. File Analysis
- **Format**: Non-standard CSV (Nested table structure).
- **Style Info (Line 2)**: 
    - Style No: Index 1
    - Qty: Index 7
    - Factory: Index 11
    - Buyer: Index 15
- **Data Table (Line 4+)**:
    - Header Line: Line 4
    - Data Lines: Line 5 onwards

## 2. Mapping Specification

| Raw Header | Standard Key | Data Type | Notes |
| :--- | :--- | :--- | :--- |
| STYLE NO | styleNo | string | Extracted from line 2 |
| QTY | totalQty | number | Extracted from line 2 |
| FACTORY | factory | string | Extracted from line 2 |
| BUYER | buyer | string | Extracted from line 2 |
| CLOOR/SIZE | color | string | Line 4, index 0 |
| 55 | size55 | number | Line 4, index 2 |
| 66.0 | size66 | number | Line 4, index 3 |
| 77.0 | size77 | number | Line 4, index 4 |
| TOTAL | totalAmount | number | Line 4, index 8 |

## 3. Unconfirmed Rules
- Are size columns always at indexes 2, 3, 4?
- What if a new size column is added? (Need dynamic parsing)
