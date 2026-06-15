# MCHS Alert Bridge add-on

This add-on exposes `POST /notification` on port `8765`, classifies Android notification text from the MCHS Russia app, and publishes Home Assistant MQTT topics and discovery payloads.

Version `0.1.0` supports `android_mode: external`: the Android device, emulator, or container runs separately and sends notification events to the add-on.

Experimental Android-in-Docker modes such as redroid are intentionally not enabled by default because they depend on host kernel binder/ashmem support and elevated privileges.
