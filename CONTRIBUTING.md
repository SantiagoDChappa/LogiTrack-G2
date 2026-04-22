# Guía de contribución — LogiTrack

## Flujo de trabajo

Las ramas siguen esta jerarquía:

```
trunk  ←  develop  ←  feature/fix branches
```

- **`trunk`** — producción. Solo recibe merges desde `develop` vía PR.
- **`develop`** — integración. Acá se mergean todas las features antes de subir a trunk.
- **`feature_SCRUM-XXX`** — una rama por historia de usuario. Se abre desde `develop` y se mergea de vuelta a `develop`.

## Crear una rama nueva

```bash
git checkout develop
git pull origin develop
git checkout -b feature_SCRUM-XXX
```

## Nombrado de ramas

| Tipo | Formato | Ejemplo |
|---|---|---|
| Nueva funcionalidad | `feature_SCRUM-XXX` | `feature_SCRUM-42` |
| Corrección de bug | `fix_SCRUM-XXX` | `fix_SCRUM-99` |

## Commits

Formato: `[SCRUM-XXX]: Descripción corta en español`

```
[SCRUM-42]: Agrega filtro de búsqueda por estado
```

- Usá el presente ("Agrega", "Corrige", "Elimina")
- Una idea por commit
- Sin punto final en el título

## Abrir un Pull Request

1. El PR debe ir de tu rama → `develop` (nunca directo a `trunk`)
2. El título debe seguir el mismo formato que los commits: `[SCRUM-XXX] Descripción`
3. Completá el cuerpo del PR con qué cambió y cómo probarlo
4. Asigná al menos 1 reviewer antes de mergear

## Requisitos para mergear

- El CI (linter) debe estar en verde
- Al menos 1 aprobación del equipo
- Sin conflictos sin resolver

## Configuración local

```bash
# Clonar e instalar
git clone https://github.com/SantiagoDChappa/LogiTrack.git
cd LogiTrack
npm install

# Variables de entorno
cp .env.example .env
# Completar los valores en .env

# Inicializar la base de datos
npm run db:setup

# Correr el servidor
npm run dev
```

## Correr los tests

```bash
npm test
```

## Correr el linter

```bash
npm run lint
```

El pre-commit hook corre el linter automáticamente sobre los archivos staged antes de cada commit.
