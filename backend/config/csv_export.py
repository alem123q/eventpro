"""Archivos CSV pensados para abrirse bien en Excel en espanol."""
import csv
import re
from decimal import Decimal

from django.http import HttpResponse
from django.utils import timezone
from django.utils.text import slugify

# Excel configurado en espanol usa ';' como separador de listas: con comas
# pondria todo en una sola columna.
DELIMITER = ';'

# Un valor que empieza con estos caracteres Excel lo interpreta como formula
# (inyeccion de formulas en CSV). Se antepone un apostrofo para que sea texto.
_FORMULA_START = ('=', '+', '-', '@', '\t', '\r')
_PLAIN_NUMBER = re.compile(r'^[+\-]?[\d\s().,\-]+$')  # telefonos como +54 9 3492 ...


def safe(value):
    if value is None:
        return ''
    text = str(value)
    if text.startswith(_FORMULA_START) and not _PLAIN_NUMBER.match(text):
        return "'" + text
    return text


def money(value):
    """Decimal('1234.5') -> '1234,50' (coma decimal, como lo lee Excel en espanol)."""
    if value is None:
        return ''
    return f'{Decimal(value):.2f}'.replace('.', ',')


def date(value):
    return value.strftime('%d/%m/%Y') if value else ''


def datetime_local(value):
    return timezone.localtime(value).strftime('%d/%m/%Y %H:%M') if value else ''


def yes_no(value):
    return 'Sí' if value else 'No'


def filename_for(prefix, title):
    """('invitados', 'Asado de fin de año') -> 'invitados-asado-de-fin-de-ano-2026-10-20.csv'"""
    return f'{prefix}-{slugify(title) or "evento"}-{timezone.localdate():%Y-%m-%d}.csv'


def csv_response(filename, header, rows):
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    # La marca BOM le indica a Excel que el archivo es UTF-8 (acentos y ñ)
    response.write('﻿')
    writer = csv.writer(response, delimiter=DELIMITER, lineterminator='\r\n')
    writer.writerow(header)
    for row in rows:
        writer.writerow([safe(cell) for cell in row])
    return response
