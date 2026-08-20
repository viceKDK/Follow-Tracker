"""Compatibilidad con el antiguo analizador CSV.

La implementacion vive en comparar_ig.py para evitar que dos generadores de
reportes evolucionen de manera diferente.
"""

from comparar_ig import procesar_datos


if __name__ == "__main__":
    procesar_datos()
