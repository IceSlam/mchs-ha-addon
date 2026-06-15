# ha-mchs-alert

Home Assistant add-on, MQTT bridge, and Android Notification Listener APK for events from the official Android application "МЧС России".

Проект не является официальным каналом оповещения. Для критичных сценариев используйте несколько источников подтверждения.

## Что делает проект

```text
Android device / emulator / container
-> официальное приложение "МЧС России"
-> MCHS Alert Listener APK
-> HTTP Bridge add-on
-> MQTT
-> Home Assistant entities
-> ваши автоматизации
```

Проект не взламывает приложение МЧС, не перехватывает трафик, не использует private API, не обходит защиту и не делает reverse engineering. Listener читает только системные Android-уведомления через официальное разрешение Notification Access, которое пользователь выдает вручную.

## Быстрая установка

1. Установите Mosquitto Broker в Home Assistant.
2. Добавьте этот репозиторий как add-on repository.
3. Установите add-on `MCHS Alert Bridge`.
4. В настройках add-on выберите регион, например `Брянская область`.
5. Запустите add-on.
6. Скачайте APK из GitHub Actions artifacts или Releases: `mchs-alert-listener.apk`.
7. Установите APK на Android-устройство.
8. Установите официальное приложение `МЧС России`.
9. В listener APK нажмите `Find MCHS app`, затем `Open notification access` и выдайте доступ к уведомлениям.
10. Укажите bridge URL, например `http://192.168.1.20:8765/notification`, или откройте deep link:

```text
mchslistener://setup?endpoint=http://192.168.1.20:8765/notification
```

QR для deep link можно сделать так:

```bash
qrencode -o mchs-listener-setup.png 'mchslistener://setup?endpoint=http://192.168.1.20:8765/notification'
```

11. Нажмите `Send test`.
12. Проверьте сущности Home Assistant и добавьте свои автоматизации.

## Что пользователь делает вручную

- устанавливает официальное приложение `МЧС России`;
- разрешает уведомления для приложения МЧС;
- отключает энергосбережение для приложения МЧС и listener APK;
- выдает listener APK доступ к уведомлениям;
- выбирает регион в настройках add-on;
- настраивает свои автоматизации.

## Что происходит автоматически

- listener находит приложение МЧС по известным package name и label;
- listener отправляет уведомления в bridge и ставит последние 20 событий в очередь при недоступности bridge;
- bridge классифицирует тревогу, отбой и unknown-события;
- MQTT topics публикуются автоматически;
- MQTT Discovery создает сущности Home Assistant;
- `binary_sensor.mchs_alert` включается при тревоге и выключается при отбое;
- unknown-уведомления не сбрасывают активную тревогу.

## Add-on Config

```yaml
mqtt_host: core-mosquitto
mqtt_port: 1883
mqtt_username: ""
mqtt_password: ""
mqtt_discovery: true
discovery_prefix: homeassistant

region: "Брянская область"
regions:
  - "Брянская область"

filter_by_region: true
publish_unknown: true
retain_state: true
deduplicate_window_seconds: 30
auto_clear_minutes: 0

listener_http_port: 8765

keywords:
  uav:
    - "беспилотная опасность"
    - "бпла"
    - "угроза атаки бпла"
    - "опасность атаки бпла"
  missile:
    - "ракетная опасность"
    - "ракетная угроза"
  air:
    - "воздушная тревога"
    - "авиационная опасность"
  cancel:
    - "отбой"
    - "опасность отменена"
    - "отмена опасности"
    - "отбой беспилотной опасности"
    - "отбой ракетной опасности"
```

`auto_clear_minutes: 0` означает, что тревога не сбрасывается автоматически.

## Android APK

Пользователю не нужно собирать APK вручную. CI собирает `mchs-alert-listener.apk` и публикует его как GitHub Actions artifact. Для релиза загрузите этот файл в GitHub Releases с именем:

```text
mchs-alert-listener.apk
```

Dev-сборка при необходимости:

```bash
cd android-listener
./gradlew assembleDebug
```

Listener автоматически ищет приложение МЧС среди пакетов:

```text
ru.mchs
ru.mchs.app
ru.mchs.mobile
ru.mchs.informer
```

Также проверяется label приложения: `МЧС`, `МЧС России`, `MCHS`. Если найден один кандидат, он выбирается автоматически. Если найдено несколько, APK показывает список. Ручной package name оставлен как advanced-настройка.

ADB-команда для отладки:

```bash
adb shell pm list packages | grep -i mchs
```

## Bridge Endpoints

```text
GET  /health
GET  /status
POST /notification
POST /test/uav
POST /test/missile
POST /test/air
POST /test/cancel
POST /test/unknown
```

Проверка:

```bash
curl -X POST http://127.0.0.1:8765/test/uav
curl http://127.0.0.1:8765/status
```

## MQTT

Topics:

```text
mchs/alerts/state
mchs/alerts/type
mchs/alerts/region
mchs/alerts/message
mchs/alerts/last_seen
mchs/alerts/last_event_type
mchs/alerts/last_event_message
mchs/alerts/last_event_seen
mchs/alerts/listener_status
mchs/alerts/bridge_status
mchs/alerts/raw
```

Debug:

```bash
mosquitto_sub -h core-mosquitto -t 'mchs/#' -v
```

`mchs/alerts/bridge_status` используется как availability topic. Bridge публикует `online`, MQTT Last Will публикует `offline`.

## Home Assistant Entities

MQTT Discovery создает:

```text
binary_sensor.mchs_alert
sensor.mchs_alert_type
sensor.mchs_alert_region
sensor.mchs_alert_message
sensor.mchs_alert_last_seen
sensor.mchs_alert_last_event_type
sensor.mchs_alert_last_event_message
sensor.mchs_alert_last_event_seen
sensor.mchs_alert_listener_status
sensor.mchs_alert_bridge_status
```

Custom integration `custom_components/mchs_alert` необязательна. Если `mqtt_discovery: true`, она обычно не нужна. Если хотите использовать integration, можно отключить discovery в add-on и указать `topic_prefix`, по умолчанию `mchs/alerts`.

Manual YAML-вариант есть в [custom_components/mchs_alert/README.md](/home/iceslam/PhpstormProjects/mchs-ha-addon/custom_components/mchs_alert/README.md).

## Примеры автоматизаций

Persistent notification:

```yaml
alias: МЧС — уведомление в Home Assistant
trigger:
  - platform: state
    entity_id: binary_sensor.mchs_alert
    to: "on"
action:
  - service: persistent_notification.create
    data:
      title: "МЧС — тревога"
      message: "{{ states('sensor.mchs_alert_message') }}"
mode: single
```

Сирена/реле:

```yaml
alias: МЧС — включить сирену
trigger:
  - platform: state
    entity_id: binary_sensor.mchs_alert
    to: "on"
action:
  - service: switch.turn_on
    target:
      entity_id: switch.sirena
mode: single
```

Отбой:

```yaml
alias: МЧС — отбой
trigger:
  - platform: state
    entity_id: binary_sensor.mchs_alert
    to: "off"
action:
  - service: persistent_notification.create
    data:
      title: "МЧС — отбой"
      message: "{{ states('sensor.mchs_alert_message') }}"
mode: single
```

## Development

Bridge:

```bash
cd addon/bridge
npm ci
npm run typecheck
npm run test
npm run build
```

Add-on Docker build from `addon/` context:

```bash
docker build -t mchs-alert-bridge:test addon
```

Android:

```bash
cd android-listener
./gradlew assembleDebug
```

CI проверяет bridge и Android build в `.github/workflows/build.yml`.

## Ограничения

Это MVP, основанный на тексте push-уведомлений Android. Качество классификации зависит от текста уведомлений приложения МЧС и выбранного региона. Для надежных сценариев используйте несколько независимых источников оповещения.
