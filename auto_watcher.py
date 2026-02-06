import os
import re
import shutil
import time

import comparar_ig


AUTO_CSV_RE = re.compile(r"^ig_auto_(.+)_(followers|following)_(\d+)\.csv$", re.IGNORECASE)


def _list_auto_csv(watch_dirs):
    items = []
    for root in watch_dirs:
        if not root or not os.path.isdir(root):
            continue
        for name in os.listdir(root):
            m = AUTO_CSV_RE.match(name)
            if not m:
                continue
            profile, phase, ts = m.group(1), m.group(2).lower(), int(m.group(3))
            items.append(
                {
                    "path": os.path.join(root, name),
                    "profile": profile,
                    "phase": phase,
                    "ts": ts,
                }
            )
    return items


def _find_new_pair_since(start_ts_ms, watch_dirs):
    items = [x for x in _list_auto_csv(watch_dirs) if x["ts"] >= start_ts_ms]
    if not items:
        return None

    by_profile = {}
    for item in items:
        by_profile.setdefault(item["profile"], []).append(item)

    best = None
    best_ts = -1
    for profile, group in by_profile.items():
        followers = max((x for x in group if x["phase"] == "followers"), key=lambda x: x["ts"], default=None)
        following = max((x for x in group if x["phase"] == "following"), key=lambda x: x["ts"], default=None)
        if not followers or not following:
            continue
        pair_ts = max(followers["ts"], following["ts"])
        if pair_ts > best_ts:
            best_ts = pair_ts
            best = {
                "profile": profile,
                "followers_path": followers["path"],
                "following_path": following["path"],
                "ts": pair_ts,
            }
    return best


def _generate_excel_from_pair(base_path, pair):
    followers = comparar_ig.leer_csv_usuarios(pair["followers_path"])
    following = comparar_ig.leer_csv_usuarios(pair["following_path"])

    profile_folder = comparar_ig.ensure_dir(
        os.path.join(base_path, comparar_ig.sanitize_folder_name(pair["profile"]))
    )
    target_followers = os.path.join(profile_folder, "followers.csv")
    target_following = os.path.join(profile_folder, "following.csv")
    shutil.copy2(pair["followers_path"], target_followers)
    shutil.copy2(pair["following_path"], target_following)

    profile_key = f"external_auto::{pair['profile']}"
    h_path = comparar_ig.historial_path(base_path, profile_key)
    followers_prev, following_prev = comparar_ig.cargar_historial(h_path)
    nuevos_seguidores = sorted(followers - followers_prev) if followers_prev else []
    nuevos_siguiendo = sorted(following - following_prev) if following_prev else []
    comparar_ig.guardar_historial(h_path, followers, following)

    output_path = os.path.join(profile_folder, "seguidores_vs_seguidos.xlsx")
    c_nos, c_no_lo_sigo, c_no_me_sigue = comparar_ig.generar_excel(
        output_path=output_path,
        titulo=f"Analisis de Perfil Externo ({pair['profile']})",
        followers=followers,
        following=following,
        nuevos_seguidores=nuevos_seguidores,
        nuevos_siguiendo=nuevos_siguiendo,
        ultimo_scrapeo=comparar_ig.format_unix_ms(pair["ts"]),
    )

    if nuevos_seguidores or nuevos_siguiendo:
        msg_nuevos = (
            f"\n\nComparacion con anterior:\n"
            f"- Nuevos seguidores: {len(nuevos_seguidores)}\n"
            f"- Nuevos siguiendo: {len(nuevos_siguiendo)}"
        )
    else:
        msg_nuevos = "\n\n(Primera ejecucion - sin comparacion previa)"

    comparar_ig.popup(
        "AUTO completado",
        f"Perfil: {pair['profile']}\n"
        f"Carpeta: {profile_folder}\n"
        f"Excel: {output_path}\n\n"
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
