import json, subprocess, sys
pdf, toc_json, out = sys.argv[1], sys.argv[2], sys.argv[3]
toc = json.load(open(toc_json))
n = int([l for l in subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout.splitlines() if l.startswith('Pages')][0].split()[1])
pages = [subprocess.run(['pdftotext', '-layout', '-f', str(i), '-l', str(i), pdf, '-'], capture_output=True, text=True).stdout for i in range(1, n + 1)]
# Saltear portada e indice: el indice termina en la pagina donde aparece "Referencias ....."
start = next(i for i, p in enumerate(pages) if 'Índice' in p) + 1
while start < n and '.....' in pages[start]:
    start += 1
result, cur = {}, start
for e in toc:
    for i in range(cur, n):
        lines = [l.strip() for l in pages[i].splitlines()]
        if e['text'] in lines:
            result[e['text']] = i + 1; cur = i; break
    else:
        print('NO ENCONTRADO:', e['text'])
json.dump(result, open(out, 'w'), ensure_ascii=False, indent=1)
print('cuerpo desde la pagina', start + 1, '| titulos ubicados:', len(result), 'de', len(toc))
print(result)
