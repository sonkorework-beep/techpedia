WEB-утилита для сотрудников тех-поддержки.

### Node backend (нужен для админок, upload)
1) Установить Node.js 18+.
2) В корне или:
- `npm install`
- `npm run start`
Или:
- `STARTUP.bat`
3) Дефолтный адрес:
- `http://localhost:8000/index.html`

### Альтернатива: только просмотр
Можно запустить статический сервер (например Python), но тогда не будут работать:
- создание/редактирование/удаление статей,
- загрузка файлов в `downloads/`,
- интеграция tasks/break через backend-прокси.

Пример:
- `python -m http.server 8000`

## Конфигурация
- Статьи: `data/guides.json` + файлы в `.guides/`
- Софт/инструкции: `data/software.json` + ссылки на файлы (например `ftp://...` или `/downloads/...`)

# Все что дальше - не работает. Чинить не буду. Надо переделывать на SQL. 
- Интеграции (Apps Script): `data/integrations.json` (поле `appsScriptUrl`)
- Tasks: `data/tasks.config.json` 
- Break: `data/break.config.json`
### Apps Script
Шаблон кода лежит в `apps-script/Code.gs`.
После деплоя Web App вставьте URL в `data/integrations.json`.
