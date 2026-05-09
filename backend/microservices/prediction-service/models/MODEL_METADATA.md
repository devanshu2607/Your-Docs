# Legacy Model Metadata

These files are kept in git for portfolio/demo purposes only.
They are **not** used by the deployed prediction service anymore.

## Deployment behavior

- runtime prediction path: external API
- deployed service loads: `qwen/qwen3-next-80b-a3b-instruct:free` by default
- Docker deployment includes: no files from this `models/` directory

## Stored assets

- `lstm_model.keras`
  - file format: Keras archive
  - saved keras version: `2.15.0`
  - saved timestamp: `2026-04-14@17:50:04`
  - file timestamp in repo: `2026-04-14 17:50:05`
- `lstm_model.h5`
  - file format: legacy HDF5 export
  - file timestamp in repo: `2026-04-14 17:47:10`
- `lstm_tokenizer.pkl`
  - file timestamp in repo: `2026-04-14 17:54:46`
- `tokens.pkl`
  - file timestamp in repo: `2026-04-14 16:38:26`

## Notes

- The repo previously used a local TensorFlow inference path.
- That path has been retired from deployment to keep builds light and reliable.
- The model files remain versioned in git only as evidence of the original work.
