WEB-утилита для сотрудников тех-поддержки.

## Запуск
Страницы используют `fetch()` и требуют HTTP.

### Рекомендовано: Node backend (нужен для админок, upload, tasks/break)
1) Установите Node.js 18+ (важно: нужен встроенный `fetch`).
2) В корне проекта:
- `npm install`
- `npm run start`
3) Откройте:
- `http://localhost:8000/index.html`

### Альтернатива: только просмотр (без админок)
Можно запустить статический сервер (например Python), но тогда не будут работать:
- создание/редактирование/удаление статей,
- загрузка файлов в `downloads/`,
- интеграция tasks/break через backend-прокси.

Пример:
- `python -m http.server 8000`

## Конфигурация
- Статьи: `data/guides.json` + файлы в `.guides/`
- Софт/инструкции: `data/software.json` + ссылки на файлы (например `ftp://...` или `/downloads/...`)
- Интеграции (Apps Script): `data/integrations.json` (поле `appsScriptUrl`)
- Tasks: `data/tasks.config.json`
- Break: `data/break.config.json`

## Apps Script
Шаблон кода лежит в `apps-script/Code.gs`.
После деплоя Web App вставьте URL в `data/integrations.json`.
