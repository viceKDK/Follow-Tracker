import csv
import glob
import hashlib
import json
import os
import re
import shutil
import sys
import tkinter as tk
from datetime import datetime
import time
from tkinter import filedialog, messagebox

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.table import Table, TableStyleInfo


def _with_hidden_root():
    root = tk.Tk()
    root.withdraw()
    return root


def popup(title, message):
    root = _with_hidden_root()
    messagebox.showinfo(title, message, parent=root)
    root.destroy()


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)
    return path


def format_dt(dt):
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def format_unix_ms(ts_ms):
    try:
        dt = datetime.fromtimestamp(ts_ms / 1000.0)
        return format_dt(dt)
    except Exception:
        return format_dt(datetime.now())


def sanitize_folder_name(text):
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", str(text or "")).strip("._")
    return safe or "perfil"


def seleccionar_archivo(titulo):
    root = _with_hidden_root()
    file_path = filedialog.askopenfilename(
        title=titulo,
        filetypes=[("JSON or CSV", "*.json *.csv"), ("All files", "*.*")],
        parent=root,
    )
    root.destroy()
    return file_path


def preguntar_modo():
    selected_mode = {"value": None}

    root = tk.Tk()
    root.title("Follow Tracker - Inicio")
    root.geometry("1000x720")
    root.minsize(900, 640)
    try:
        root.state("zoomed")
    except Exception:
        pass
    root.configure(bg="#f4f7fb")

    card = tk.Frame(root, bg="white", bd=1, relief="solid")
    card.pack(fill="both", expand=True, padx=16, pady=16)

    title = tk.Label(
        card,
        text="Elige como quieres analizar Instagram",
        font=("Segoe UI", 15, "bold"),
        bg="white",
        fg="#1d3557",
    )
    title.pack(anchor="w", padx=18, pady=(16, 8))

    subtitle = tk.Label(
        card,
        text="El flujo recomendado para cuentas externas es AUTO 1-click (esperar).",
        font=("Segoe UI", 10),
        bg="white",
        fg="#4a5568",
        wraplength=700,
        justify="left",
    )
    subtitle.pack(anchor="w", padx=18, pady=(0, 12))

    my_account_box = tk.LabelFrame(
        card,
        text="Modo 1: Mi cuenta (JSON)",
        font=("Segoe UI", 10, "bold"),
        bg="white",
        fg="#1f7a8c",
        padx=12,
        pady=10,
    )
    my_account_box.pack(fill="x", padx=18, pady=(0, 10))

    my_account_text = (
        "Requisitos:\n"
        "- Crear carpeta yo dentro del proyecto.\n"
        "- Poner ahi: followers_1.json y following.json.\n"
        "- Se genera yo/seguidores_vs_seguidos.xlsx."
    )
    tk.Label(
        my_account_box,
        text=my_account_text,
        font=("Segoe UI", 10),
        bg="white",
        fg="#2d3748",
        justify="left",
        anchor="w",
    ).pack(fill="x")

    auto_box = tk.LabelFrame(
        card,
        text="Modo 2: Otra cuenta (AUTO 1-click)",
        font=("Segoe UI", 10, "bold"),
        bg="white",
        fg="#155724",
        padx=12,
        pady=10,
    )
    auto_box.pack(fill="x", padx=18, pady=(0, 10))

    auto_text = (
        "Flujo automatico recomendado:\n"
        "1. Deja abierto el perfil de la persona en Instagram.\n"
        "2. Ejecuta smart_scraper.js (hace seguidores y luego seguidos solo).\n"
        "3. Abre esta app y pulsa AUTO.\n\n"
        "La app detecta el ultimo par de CSV, crea carpeta por usuario,\n"
        "copia ahi ambos CSV y genera el Excel automaticamente."
    )
    tk.Label(
        auto_box,
        text=auto_text,
        font=("Segoe UI", 10),
        bg="white",
        fg="#2d3748",
        justify="left",
        anchor="w",
        wraplength=740,
    ).pack(fill="x")

    buttons = tk.Frame(card, bg="white")
    buttons.pack(fill="x", padx=18, pady=(10, 16))

    def choose_local():
        selected_mode["value"] = "local"
        root.destroy()

    def choose_auto_wait():
        selected_mode["value"] = "auto_wait"
        root.destroy()

    def close_app():
        selected_mode["value"] = None
        root.destroy()

    tk.Button(
        buttons,
        text="Usar mi cuenta (JSON)",
        font=("Segoe UI", 10, "bold"),
        bg="#1f7a8c",
        fg="white",
        activebackground="#16697a",
        activeforeground="white",
        padx=14,
        pady=8,
        relief="flat",
        command=choose_local,
        cursor="hand2",
    ).pack(side="left", padx=(0, 10))

    tk.Button(
        buttons,
        text="AUTO 1-click (esperar)",
        font=("Segoe UI", 10, "bold"),
        bg="#0f766e",
        fg="white",
        activebackground="#115e59",
        activeforeground="white",
        padx=14,
        pady=8,
        relief="flat",
        command=choose_auto_wait,
        cursor="hand2",
    ).pack(side="left")

    tk.Button(
        buttons,
        text="Salir",
        font=("Segoe UI", 10),
        bg="#e2e8f0",
        fg="#1a202c",
        activebackground="#cbd5e0",
        activeforeground="#1a202c",
        padx=12,
        pady=8,
        relief="flat",
        command=close_app,
        cursor="hand2",
    ).pack(side="right")

    root.protocol("WM_DELETE_WINDOW", close_app)
    root.mainloop()
    return selected_mode["value"]


def cargar_json(path):
    if not os.path.exists(path):
        raise FileNotFoundError(f"No se encontro el archivo: {os.path.basename(path)}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def leer_csv_usuarios(path):
    usuarios = set()
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            usuario = row[0].strip()
            if not usuario or usuario.lower() == "usuario":
                continue
            usuarios.add(usuario)
    return usuarios


def parse_followers_json(path):
    raw = cargar_json(path)
    return {
        item["string_list_data"][0]["value"]
        for item in raw
        if item.get("string_list_data")
        and item["string_list_data"]
        and item["string_list_data"][0].get("value")
    }


def parse_following_json(path):
    raw = cargar_json(path)
    rel = raw.get("relationships_following", [])
    return {
        item["string_list_data"][0]["value"]
        for item in rel
        if item.get("string_list_data")
        and item["string_list_data"]
        and item["string_list_data"][0].get("value")
    }


def historial_path(base_path, key):
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]
    return os.path.join(base_path, f"historial_{digest}.json")


def cargar_historial(path):
    if not os.path.exists(path):
        return set(), set()
    try:
        data = cargar_json(path)
        return set(data.get("followers", [])), set(data.get("following", []))
    except Exception:
        return set(), set()


def guardar_historial(path, followers, following):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(
            {"followers": sorted(followers), "following": sorted(following)},
            f,
            ensure_ascii=False,
            indent=2,
        )


def generar_excel(
    output_path,
    titulo,
    followers,
    following,
    nuevos_seguidores,
    nuevos_siguiendo,
    ultimo_scrapeo,
):
    nos_seguimos = sorted(followers & following)
    no_me_sigue = sorted(following - followers)
    no_lo_sigo = sorted(followers - following)

    wb = Workbook()
    ws = wb.active
    ws.title = "Seguimiento Instagram"
    ws.sheet_view.showGridLines = False

    ws.merge_cells("B1:L3")
    ws["B1"] = titulo
    ws["B1"].font = Font(size=24, bold=True, color="2E75B6")
    ws["B1"].alignment = Alignment(horizontal="center", vertical="center")

    headers = [
        f"Nos seguimos ({len(nos_seguimos)})",
        "",
        f"No lo sigo ({len(no_lo_sigo)})",
        "",
        f"No me sigue ({len(no_me_sigue)})",
        "",
        f"Nuevos Seguidores ({len(nuevos_seguidores)})",
        "",
        f"Nuevos Siguiendo ({len(nuevos_siguiendo)})",
        "",
        "Ultimo Scrapeo",
    ]

    for col_idx, text in enumerate(headers, 2):
        cell = ws.cell(row=6, column=col_idx, value=text)
        if not text:
            continue
        cell.font = Font(bold=True, color="FFFFFF")
        cell.alignment = Alignment(horizontal="center")
        if col_idx == 2:
            cell.fill = PatternFill(start_color="4F81BD", end_color="4F81BD", fill_type="solid")
        if col_idx == 4:
            cell.fill = PatternFill(start_color="E46C0A", end_color="E46C0A", fill_type="solid")
        if col_idx == 6:
            cell.fill = PatternFill(start_color="C00000", end_color="C00000", fill_type="solid")
        if col_idx == 8:
            cell.fill = PatternFill(start_color="92D050", end_color="92D050", fill_type="solid")
        if col_idx == 10:
            cell.fill = PatternFill(start_color="00B0F0", end_color="00B0F0", fill_type="solid")
        if col_idx == 12:
            cell.fill = PatternFill(start_color="6A1B9A", end_color="6A1B9A", fill_type="solid")

    max_len = max(
        len(nos_seguimos),
        len(no_me_sigue),
        len(no_lo_sigo),
        len(nuevos_seguidores),
        len(nuevos_siguiendo),
        1,
    )
    for i in range(max_len):
        row_data = [
            "",
            nos_seguimos[i] if i < len(nos_seguimos) else "",
            "",
            no_lo_sigo[i] if i < len(no_lo_sigo) else "",
            "",
            no_me_sigue[i] if i < len(no_me_sigue) else "",
            "",
            nuevos_seguidores[i] if i < len(nuevos_seguidores) else "",
            "",
            nuevos_siguiendo[i] if i < len(nuevos_siguiendo) else "",
            "",
            ultimo_scrapeo,
        ]
        ws.append(row_data)

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
    ws.column_dimensions["K"].width = 10
    ws.column_dimensions["L"].width = 24

    thin_border = Border(
        left=Side(style="thin"),
        right=Side(style="thin"),
        top=Side(style="thin"),
        bottom=Side(style="thin"),
    )

    table_defs = [
        ("Tab_NosSeg", f"B6:B{max(7, max_len + 6)}", "TableStyleMedium2"),
        ("Tab_NoLoSig", f"D6:D{max(7, max_len + 6)}", "TableStyleMedium3"),
        ("Tab_NoMeSig", f"F6:F{max(7, max_len + 6)}", "TableStyleMedium7"),
        ("Tab_NuevosSeg", f"H6:H{max(7, max_len + 6)}", "TableStyleMedium9"),
        ("Tab_NuevosSig", f"J6:J{max(7, max_len + 6)}", "TableStyleMedium11"),
        ("Tab_UltimoScrapeo", f"L6:L{max(7, max_len + 6)}", "TableStyleMedium4"),
    ]
    for name, ref, style in table_defs:
        tab = Table(displayName=name, ref=ref)
        tab.tableStyleInfo = TableStyleInfo(name=style, showRowStripes=True)
        ws.add_table(tab)
        col_letter = ref[0]
        for row in range(6, max(7, max_len + 6) + 1):
            ws[f"{col_letter}{row}"].border = thin_border

    wb.save(output_path)
    return len(nos_seguimos), len(no_lo_sigo), len(no_me_sigue)


def cargar_modo_mi_cuenta(base_path):
    yo_dir = ensure_dir(os.path.join(base_path, "yo"))
    followers_path = os.path.join(yo_dir, "followers_1.json")
    following_path = os.path.join(yo_dir, "following.json")
    followers = parse_followers_json(followers_path)
    following = parse_following_json(following_path)

    h_path = historial_path(base_path, "local_json")
    followers_prev, following_prev = cargar_historial(h_path)

    nuevos_seguidores = sorted(followers - followers_prev) if followers_prev else []
    nuevos_siguiendo = sorted(following - following_prev) if following_prev else []
    guardar_historial(h_path, followers, following)

    return {
        "titulo": "Seguimiento de Instagram",
        "output_path": os.path.join(yo_dir, "seguidores_vs_seguidos.xlsx"),
        "work_dir": yo_dir,
        "followers": followers,
        "following": following,
        "nuevos_seguidores": nuevos_seguidores,
        "nuevos_siguiendo": nuevos_siguiendo,
        "modo_label": "mi cuenta (JSON)",
        "ultimo_scrapeo": format_dt(datetime.now()),
    }


def cargar_modo_otra_cuenta(base_path):
    path_followers = seleccionar_archivo("Selecciona CSV de seguidores (cuenta externa)")
    if not path_followers:
        return None
    path_following = seleccionar_archivo("Selecciona CSV de seguidos (cuenta externa)")
    if not path_following:
        return None

    followers = leer_csv_usuarios(path_followers)
    following = leer_csv_usuarios(path_following)

    profile_key = f"external::{os.path.basename(path_followers)}::{os.path.basename(path_following)}"
    h_path = historial_path(base_path, profile_key)
    followers_prev, following_prev = cargar_historial(h_path)

    nuevos_seguidores = sorted(followers - followers_prev) if followers_prev else []
    nuevos_siguiendo = sorted(following - following_prev) if following_prev else []
    guardar_historial(h_path, followers, following)

    out_dir = os.path.dirname(path_followers) or base_path
    output_path = os.path.join(out_dir, "analisis_externo.xlsx")
    return {
        "titulo": "Analisis de Perfil Externo",
        "output_path": output_path,
        "work_dir": out_dir,
        "followers": followers,
        "following": following,
        "nuevos_seguidores": nuevos_seguidores,
        "nuevos_siguiendo": nuevos_siguiendo,
        "modo_label": "otra cuenta (CSV)",
        "ultimo_scrapeo": format_dt(datetime.now()),
    }


def _parse_auto_csv_name(path):
    name = os.path.basename(path)
    # ig_auto_<profile>_<phase>_<timestamp>.csv
    m = re.match(r"^ig_auto_(.+)_(followers|following)_(\d+)\.csv$", name, re.IGNORECASE)
    if not m:
        return None
    profile, phase, ts = m.group(1), m.group(2).lower(), int(m.group(3))
    return {"path": path, "profile": profile, "phase": phase, "ts": ts}


def _collect_auto_csv_candidates(base_path):
    candidates = []
    roots = [base_path, os.path.join(os.path.expanduser("~"), "Downloads")]
    for root in roots:
        if not root or not os.path.isdir(root):
            continue
        pattern = os.path.join(root, "ig_auto_*_*.csv")
        for p in glob.glob(pattern):
            parsed = _parse_auto_csv_name(p)
            if parsed:
                candidates.append(parsed)
    return candidates


def _find_latest_auto_pair(base_path):
    candidates = _collect_auto_csv_candidates(base_path)
    if not candidates:
        return None

    by_profile = {}
    for item in candidates:
        by_profile.setdefault(item["profile"], []).append(item)

    best = None
    best_ts = -1
    for profile, items in by_profile.items():
        latest_followers = max((x for x in items if x["phase"] == "followers"), key=lambda x: x["ts"], default=None)
        latest_following = max((x for x in items if x["phase"] == "following"), key=lambda x: x["ts"], default=None)
        if not latest_followers or not latest_following:
            continue
        pair_ts = max(latest_followers["ts"], latest_following["ts"])
        if pair_ts > best_ts:
            best_ts = pair_ts
            best = {
                "profile": profile,
                "followers_path": latest_followers["path"],
                "following_path": latest_following["path"],
                "ts": pair_ts,
            }
    return best


def _find_new_auto_pair_since(base_path, start_ts_ms):
    candidates = [x for x in _collect_auto_csv_candidates(base_path) if x["ts"] >= start_ts_ms]
    if not candidates:
        return None

    by_profile = {}
    for item in candidates:
        by_profile.setdefault(item["profile"], []).append(item)

    best = None
    best_ts = -1
    for profile, items in by_profile.items():
        latest_followers = max((x for x in items if x["phase"] == "followers"), key=lambda x: x["ts"], default=None)
        latest_following = max((x for x in items if x["phase"] == "following"), key=lambda x: x["ts"], default=None)
        if not latest_followers or not latest_following:
            continue
        pair_ts = max(latest_followers["ts"], latest_following["ts"])
        if pair_ts > best_ts:
            best_ts = pair_ts
            best = {
                "profile": profile,
                "followers_path": latest_followers["path"],
                "following_path": latest_following["path"],
                "ts": pair_ts,
            }
    return best


def _build_auto_data_from_pair(base_path, pair):
    followers = leer_csv_usuarios(pair["followers_path"])
    following = leer_csv_usuarios(pair["following_path"])

    profile_folder = ensure_dir(os.path.join(base_path, sanitize_folder_name(pair["profile"])))
    target_followers = os.path.join(profile_folder, "followers.csv")
    target_following = os.path.join(profile_folder, "following.csv")
    shutil.copy2(pair["followers_path"], target_followers)
    shutil.copy2(pair["following_path"], target_following)

    profile_key = f"external_auto::{pair['profile']}"
    h_path = historial_path(base_path, profile_key)
    followers_prev, following_prev = cargar_historial(h_path)

    nuevos_seguidores = sorted(followers - followers_prev) if followers_prev else []
    nuevos_siguiendo = sorted(following - following_prev) if following_prev else []
    guardar_historial(h_path, followers, following)

    output_path = os.path.join(profile_folder, "seguidores_vs_seguidos.xlsx")
    return {
        "titulo": f"Analisis de Perfil Externo ({pair['profile']})",
        "output_path": output_path,
        "work_dir": profile_folder,
        "followers": followers,
        "following": following,
        "nuevos_seguidores": nuevos_seguidores,
        "nuevos_siguiendo": nuevos_siguiendo,
        "modo_label": "otra cuenta (AUTO)",
        "ultimo_scrapeo": format_unix_ms(pair["ts"]),
        "copied_files": [target_followers, target_following],
    }


def cargar_modo_otra_cuenta_auto(base_path):
    pair = _find_latest_auto_pair(base_path)
    if not pair:
        raise FileNotFoundError(
            "No se encontro un par automatico de CSV.\n"
            "Archivos esperados: ig_auto_<perfil>_followers_<ts>.csv y ig_auto_<perfil>_following_<ts>.csv\n"
            "en la carpeta del programa o en Downloads."
        )

    return _build_auto_data_from_pair(base_path, pair)


def cargar_modo_otra_cuenta_auto_wait(base_path, timeout_seconds=60 * 45, poll_seconds=2):
    popup(
        "AUTO 1-click",
        "La app esperara a que termines el scraper en Instagram.\n\n"
        "Pasos ahora:\n"
        "1. Deja esta app abierta.\n"
        "2. Ve a Instagram perfil objetivo.\n"
        "3. Ejecuta smart_scraper.js.\n"
        "4. Al terminar, el Excel se generara solo.",
    )
    start_ts_ms = int(time.time() * 1000)
    start = time.time()
    while (time.time() - start) <= timeout_seconds:
        pair = _find_new_auto_pair_since(base_path, start_ts_ms)
        if pair:
            return _build_auto_data_from_pair(base_path, pair)
        time.sleep(poll_seconds)
    raise TimeoutError("No se detectaron 2 CSV nuevos dentro del tiempo limite.")


def procesar_datos():
    try:
        if getattr(sys, "frozen", False):
            base_path = os.path.dirname(sys.executable)
        else:
            base_path = os.path.dirname(os.path.abspath(__file__))

        choice = preguntar_modo()
        if choice is None:
            return

        if choice == "local":
            data = cargar_modo_mi_cuenta(base_path)
        elif choice == "auto_wait":
            data = cargar_modo_otra_cuenta_auto_wait(base_path)
        else:
            data = cargar_modo_otra_cuenta(base_path)
            if data is None:
                return

        c_nos, c_no_lo_sigo, c_no_me_sigue = generar_excel(
            data["output_path"],
            data["titulo"],
            data["followers"],
            data["following"],
            data["nuevos_seguidores"],
            data["nuevos_siguiendo"],
            data["ultimo_scrapeo"],
        )

        if data["nuevos_seguidores"] or data["nuevos_siguiendo"]:
            msg_nuevos = (
                f"\n\nComparacion con anterior:\n"
                f"- Nuevos seguidores: {len(data['nuevos_seguidores'])}\n"
                f"- Nuevos siguiendo: {len(data['nuevos_siguiendo'])}"
            )
        else:
            msg_nuevos = "\n\n(Primera ejecucion - sin comparacion previa)"

        files_msg = ""
        if data.get("copied_files"):
            files_msg = (
                "\nCSV guardados en carpeta del usuario:\n"
                f"- {data['copied_files'][0]}\n"
                f"- {data['copied_files'][1]}\n"
            )

        popup(
            "Listo",
            f"Modo: {data['modo_label']}\n"
            f"Carpeta de salida:\n{data.get('work_dir', os.path.dirname(data['output_path']))}\n"
            f"Archivo generado:\n{data['output_path']}\n\n"
            f"Resumen:\n"
            f"- Nos seguimos: {c_nos}\n"
            f"- No lo sigo: {c_no_lo_sigo}\n"
            f"- No me sigue: {c_no_me_sigue}"
            f"{msg_nuevos}\n"
            f"Ultimo scrapeo: {data['ultimo_scrapeo']}"
            f"{files_msg}",
        )

    except FileNotFoundError as e:
        popup("Archivo faltante", str(e))
    except TimeoutError as e:
        popup("Tiempo agotado", str(e))
    except Exception as e:
        popup("Error", f"Ocurrio un error inesperado:\n{str(e)}")


if __name__ == "__main__":
    procesar_datos()
