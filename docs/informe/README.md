# Informe del proyecto

`Informe_EventPro_Programacion.docx` es el informe en formato APA 7 (hoja A4).

## Regenerarlo

Requiere Node.js con la librería `docx`, LibreOffice y Poppler (`pdftotext`).

```bash
node generar_informe.js paginas.json      # genera el .docx
soffice --headless --convert-to pdf Informe_EventPro_Programacion.docx
python ubicar_paginas.py Informe_EventPro_Programacion.pdf .toc.json paginas.json
node generar_informe.js paginas.json      # vuelve a generar con los números del índice
```

Las capturas y diagramas están en `img/`.
