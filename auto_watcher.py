import os
import time

import comparar_ig


def _list_auto_csv(watch_dirs):
    items = []
    for root in watch_dirs:
        if not root or not os.path.isdir(root):
            continue
        for name in os.listdir(root):
            parsed = comparar_ig._parse_auto_csv_name(os.path.join(root, name))
            if parsed:
                items.append(parsed)
    return items


def _find_new_pair_since(start_ts_ms, watch_dirs):
    items = [x for x in _list_auto_csv(watch_dirs) if x["ts"] >= start_ts_ms]
    return comparar_ig._select_best_auto_pair(items)


def _generate_excel_from_pair(base_path, pair):
    data = comparar_ig._build_auto_data_from_pair(base_path, pair)
    c_nos, c_no_lo_sigo, c_no_me_sigue = comparar_ig.generar_excel(
        output_path=data["output_path"],
        titulo=data["titulo"],
        followers=data["followers"],
        following=data["following"],
        nuevos_seguidores=data["nuevos_seguidores"],
        nuevos_siguiendo=data["nuevos_siguiendo"],
        ultimo_scrapeo=data["ultimo_scrapeo"],
        dejaron_de_seguir=data["dejaron_de_seguir"],
        dejaste_de_seguir=data["dejaste_de_seguir"],
    )
    # Commit the baseline only after the workbook was successfully written.
    history_saved = True
    if data.get("history_warning"):
        history_saved = comparar_ig.confirmar_actualizacion_historial(data["history_warning"])
    if history_saved:
        comparar_ig.guardar_historial(data["history_path"], data["followers"], data["following"])

    if data["has_history"]:
        msg_nuevos = (
            f"\n\nComparacion con anterior:\n"
            f"- Nuevos seguidores: {len(data['nuevos_seguidores'])}\n"
            f"- Nuevos siguiendo: {len(data['nuevos_siguiendo'])}\n"
            f"- Dejaron de seguirte: {len(data['dejaron_de_seguir'])}\n"
            f"- Dejaste de seguir: {len(data['dejaste_de_seguir'])}"
        )
        if not history_saved:
            msg_nuevos += "\n- Historial: se conservo la linea base anterior."
    elif history_saved:
        msg_nuevos = "\n\n(Primera ejecucion: se guardo la linea base)"
    else:
        msg_nuevos = "\n\nNo se guardo una linea base."

    comparar_ig.popup(
        "AUTO completado",
        f"Perfil: {pair['profile']}\n"
        f"Carpeta: {data['work_dir']}\n"
        f"Excel: {data['output_path']}\n\n"
        f"Resumen:\n"
        f"- Nos seguimos: {c_nos}\n"
        f"- No lo sigo: {c_no_lo_sigo}\n"
        f"- No me sigue: {c_no_me_sigue}"
        f"{msg_nuevos}",
    )


def main():
    base_path = os.path.dirname(os.path.abspath(__file__))
    downloads = os.path.join(os.path.expanduser("~"), "Downloads")
    watch_dirs = [downloads, base_path]

    start_ts_ms = int(time.time() * 1000)
    timeout_seconds = 60 * 45
    poll_seconds = 2

    print("AUTO watcher iniciado.")
    print("Esperando nuevos CSV del scraper...")
    print(f"Carpetas observadas: {watch_dirs}")

    start = time.time()
    while (time.time() - start) <= timeout_seconds:
        pair = _find_new_pair_since(start_ts_ms, watch_dirs)
        if pair:
            print(f"Par detectado para perfil: {pair['profile']}")
            _generate_excel_from_pair(base_path, pair)
            print("Proceso AUTO completado.")
            return
        time.sleep(poll_seconds)

    comparar_ig.popup(
        "AUTO cancelado",
        "No se detecto un par nuevo de CSV dentro del tiempo limite.\n"
        "Vuelve a ejecutar auto_watcher.py y luego el smart_scraper.js.",
    )


if __name__ == "__main__":
    main()
