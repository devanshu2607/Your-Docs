from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
GATEWAY_MAIN = BACKEND_DIR / "microservices" / "gateway-service" / "main.py"

spec = spec_from_file_location("gateway_main", GATEWAY_MAIN)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to load gateway app from {GATEWAY_MAIN}")

module = module_from_spec(spec)
spec.loader.exec_module(module)

app = module.app
