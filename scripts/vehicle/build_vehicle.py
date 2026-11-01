"""
Tek giriş noktası: araç başına yapılandırma (vehicles.config.json) ile araç GLB'si üretir.

    python -I scripts/vehicle/build_vehicle.py -- --vehicle w140|dogan [--out yol.glb]

w140 → build_w140.py (aynı çıktı; yapılandırmadan kaynak/plaka/çıktı yolları gelir)
dogan → recipe_dogan.py
Yeni araç: yapılandırmaya girdi + reçete modülü (recipe_<ad>.py, run(cfg, opts) fonksiyonu).
"""
import importlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)


def cli():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'vehicle': None, 'out': None}
    for i in range(0, len(argv) - 1, 2):
        o[argv[i].lstrip('-')] = argv[i + 1]
    return o


def main():
    o = cli()
    config = json.load(open(os.path.join(HERE, 'vehicles.config.json'), encoding='utf8'))
    cfg = config['vehicles'].get(o['vehicle'])
    if not cfg:
        sys.exit(f"'{o['vehicle']}' vehicles.config.json içinde yok: {', '.join(config['vehicles'])}")
    out = o['out'] or os.path.join(ROOT, cfg['out'])
    if cfg['recipe'] == 'w140':
        sys.argv = [sys.argv[0], '--', '--src', os.path.join(ROOT, cfg['source']), '--out', out,
                    '--plate', os.path.join(ROOT, cfg['plate']['image'])]
        importlib.import_module('build_w140').main()
    else:
        importlib.import_module(f"recipe_{cfg['recipe']}").run(cfg, {'out': out})


if __name__ == '__main__':
    main()
