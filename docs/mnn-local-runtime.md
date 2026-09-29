# MNN Local Runtime

Signal Copilot uses an OpenAI-compatible adapter for its on-device provider. The actual model and MNN runtime live on an Android device running MNN Chat; this repository supplies the BFF contract, retrieval context, error handling, and UI state.

## Device setup

1. Build or install [MNN Chat](https://github.com/alibaba/MNN/tree/master/apps/Android/MnnLlmChat), then download a supported local model in the app.
2. Enable its OpenAI-compatible API service and copy the URL shown by the app. Keep the `/v1` path segment.
3. Ensure the development machine can reach the device address. Use the device LAN IP or `adb reverse`/`adb forward` as appropriate for the chosen API direction.
4. Copy `.env.example` to `.env`, set `MNN_BASE_URL`, `MNN_API_KEY` if the service requires it, and `MNN_MODEL` to the model exposed by the service.
5. Start Signal Copilot. Select **On-device** and submit a non-calculation question.

The API request sent to MNN is `POST {MNN_BASE_URL}/chat/completions` with `model`, `messages`, and `stream: false`. The BFF injects the top retrieved workspace notes into the system message and returns the MNN answer with those notes as citations.

## Failure behavior

- Missing `MNN_BASE_URL`: the UI reports that the MNN endpoint is not configured.
- Unreachable device, authentication failure, or invalid response: the API returns a visible 502 error instead of a fabricated fallback answer.
- Simple arithmetic remains local and deterministic so it does not require model startup.

## Production mobile path

For a production Android client, move `completeWithMnn()` behind a native bridge or call the MNN runtime directly in the app. Keep the request, citation, streaming-event, and runtime-metadata schemas unchanged so cloud and on-device paths remain interchangeable.
