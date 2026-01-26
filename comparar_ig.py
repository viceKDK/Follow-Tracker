import json
import os
import sys
import tkinter as tk
from tkinter import messagebox
from openpyxl import Workbook
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

def popup(title, message):
    """Muestra una ventana emergente con un mensaje."""
    root = tk.Tk()
    root.withdraw()
    messagebox.showinfo(title, message)
    root.destroy()

def cargar_json(path):
    """Carga un archivo JSON y maneja errores básicos."""
    if not os.path.exists(path):
        raise FileNotFoundError(f"No se encontró el archivo: {os.path.basename(path)}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def procesar_datos():
    try:
        if getattr(sys, 'frozen', False):
            base_path = os.path.dirname(sys.executable)
        else:
            base_path = os.path.dirname(os.path.abspath(__file__))

        followers_path = os.path.join(base_path, "followers_1.json")
        following_path = os.path.join(base_path, "following.json")
        historial_path = os.path.join(base_path, "historial.json")

        followers_raw = cargar_json(followers_path)
        followers = {entry["string_list_data"][0]["value"] for entry in followers_raw if "string_list_data" in entry}

        following_json = cargar_json(following_path)
        following_raw = following_json.get("relationships_following", [])
        following = {entry["string_list_data"][0]["value"] for entry in following_raw if "string_list_data" in entry}

        # Cargar historial previo si existe
        followers_previos = set()
        following_previos = set()
        if os.path.exists(historial_path):
            try:
                historial = cargar_json(historial_path)
                followers_previos = set(historial.get("followers", []))
                following_previos = set(historial.get("following", []))
            except:
                pass

        # Detectar nuevos comparando con historial previo
        nuevos_seguidores = sorted(followers - followers_previos) if followers_previos else []
        nuevos_siguiendo = sorted(following - following_previos) if following_previos else []

        nos_seguimos = sorted(followers & following)
        no_me_sigue = sorted(following - followers)
        no_lo_sigo = sorted(followers - following)

        # Guardar historial actual para la próxima ejecución
        with open(historial_path, "w", encoding="utf-8") as f:
            json.dump({
                "followers": list(followers),
                "following": list(following)
            }, f, ensure_ascii=False, indent=2)  

        wb = Workbook()
        ws = wb.active
        ws.title = "Seguimiento Instagram"
        ws.sheet_view.showGridLines = False

        # --- 1. TITULO PRINCIPAL (Centrado en B1:H3) ---
        ws.merge_cells("B1:H3")
        ws["B1"] = "Seguimiento de Instagram"
        ws["B1"].font = Font(size=24, bold=True, color="2E75B6")
        ws["B1"].alignment = Alignment(horizontal="center", vertical="center")

        # --- FILAS DE SEPARACION (4 y 5) ---
        # No hacemos nada en 4 y 5 para que queden vacías

        # --- 2. ENCABEZADOS DE TABLAS (Fila 6) ---
        headers = [
            f"Nos seguimos ({len(nos_seguimos)})",
            "",
            f"No lo sigo ({len(no_lo_sigo)})",
            "",
            f"No me sigue ({len(no_me_sigue)})",
            "",
            f"Nuevos Seguidores ({len(nuevos_seguidores)})",
            "",
            f"Nuevos Siguiendo ({len(nuevos_siguiendo)})"
        ]

        for col_idx, text in enumerate(headers, 2): # Columna B es index 2
            cell = ws.cell(row=6, column=col_idx, value=text)
            if text:
                cell.font = Font(bold=True, color="FFFFFF")
                cell.alignment = Alignment(horizontal="center")
                if col_idx == 2: cell.fill = PatternFill(start_color="4F81BD", end_color="4F81BD", fill_type="solid") # Azul
                if col_idx == 4: cell.fill = PatternFill(start_color="E46C0A", end_color="E46C0A", fill_type="solid") # Naranja
                if col_idx == 6: cell.fill = PatternFill(start_color="C00000", end_color="C00000", fill_type="solid") # Rojo
                if col_idx == 8: cell.fill = PatternFill(start_color="92D050", end_color="92D050", fill_type="solid") # Verde claro
                if col_idx == 10: cell.fill = PatternFill(start_color="00B0F0", end_color="00B0F0", fill_type="solid") # Celeste

        # --- 3. DATOS (Desde Fila 7) ---
        max_len = max(len(nos_seguimos), len(no_me_sigue), len(no_lo_sigo), len(nuevos_seguidores), len(nuevos_siguiendo))
        for i in range(max_len):
            row_data = [
                "", # Columna A
                nos_seguimos[i] if i < len(nos_seguimos) else "",
                "",
                no_lo_sigo[i] if i < len(no_lo_sigo) else "",
                "",
                no_me_sigue[i] if i < len(no_me_sigue) else "",
                "",
                nuevos_seguidores[i] if i < len(nuevos_seguidores) else "",
                "",
                nuevos_siguiendo[i] if i < len(nuevos_siguiendo) else ""
            ]
            ws.append(row_data)

        # --- 4. FORMATO ---
        # QUITAMOS freeze_panes para que el título no sea "sticky"
        ws.freeze_panes = None

        ws.column_dimensions["A"].width = 5
        ws.column_dimensions["B"].width = 30
        ws.column_dimensions["C"].width = 10
        ws.column_dimensions["D"].width = 30
        ws.column_dimensions["E"].width = 10
        ws.column_dimensions["F"].width = 30
        ws.column_dimensions["G"].width = 10
        ws.column_dimensions["H"].width = 30
        ws.column_dimensions["I"].width = 10
        ws.column_dimensions["J"].width = 30

        thin_border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )

        # Tablas (Empezando en Fila 6)
        table_range_b = f"B6:B{max(7, max_len + 6)}"
        table_range_d = f"D6:D{max(7, max_len + 6)}"
        table_range_f = f"F6:F{max(7, max_len + 6)}"
        table_range_h = f"H6:H{max(7, max_len + 6)}"
        table_range_j = f"J6:J{max(7, max_len + 6)}"

        for i, (name, ref, style) in enumerate([
            ("Tab_NosSeg", table_range_b, "TableStyleMedium2"),
            ("Tab_NoLoSig", table_range_d, "TableStyleMedium3"),
            ("Tab_NoMeSig", table_range_f, "TableStyleMedium7"),
            ("Tab_NuevosSeg", table_range_h, "TableStyleMedium9"),
            ("Tab_NuevosSig", table_range_j, "TableStyleMedium11")
        ]):
            tab = Table(displayName=name, ref=ref)
            tab.tableStyleInfo = TableStyleInfo(name=style, showRowStripes=True)
            ws.add_table(tab)

            # Aplicar bordes para encuadrar
            start_row = 6
            end_row = max(7, max_len + 6)
            col_letter = ref[0]
            for row in range(start_row, end_row + 1):
                ws[f"{col_letter}{row}"].border = thin_border

        output_path = os.path.join(base_path, "seguidores_vs_seguidos.xlsx")
        wb.save(output_path)

        mensaje_comparacion = ""
        if nuevos_seguidores or nuevos_siguiendo:
            mensaje_comparacion = f"\n\nComparación con anterior:\n- Nuevos seguidores: {len(nuevos_seguidores)}\n- Nuevos siguiendo: {len(nuevos_siguiendo)}"
        else:
            mensaje_comparacion = "\n\n(Primera ejecución - no hay comparación)"

        popup("Listo", f"Archivo generado correctamente.\n\nResumen:\n- Nos seguimos: {len(nos_seguimos)}\n- No lo sigo: {len(no_lo_sigo)}\n- No me sigue: {len(no_me_sigue)}{mensaje_comparacion}")

    except FileNotFoundError as e:
        popup("Archivo faltante", str(e))
    except Exception as e:
        popup("Error", f"Ocurrió un error inesperado:\n{str(e)}")

if __name__ == "__main__":
    procesar_datos()
