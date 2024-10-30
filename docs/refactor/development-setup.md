# Development Setup Guide

## Prerequisites

1. Node.js (v18+)
2. Bun Package Manager
3. Redis
4. Git
5. VSCode (recommended)

## Initial Setup

1. Clone the Repository

```bash
git clone https://github.com/your-org/mondiale.git
cd mondiale
```

2. Install Dependencies

```bash
bun install
```

3. Environment Setup

```bash
# Copy example environment file
cp .env.example .env

# Update with your local settings
vim .env
```

4. Start Development Server

```bash
bun run dev
```

## VSCode Configuration

1. Required Extensions

```json
{
  "recommendations": [
    "Vue.volar",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "streetsidesoftware.code-spell-checker"
  ]
}
```

2. Workspace Settings

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

## Development Workflow

1. Create Feature Branch

```bash
git checkout -b feature/your-feature-name
```

2. Run Tests

```bash
# Unit tests
bun run test:unit

# Integration tests
bun run test:integration

# E2E tests
bun run test:e2e
```

3. Build for Production

```bash
bun run build
```

## Docker Setup

1. Build Container

```bash
docker build -t mondiale .
```

2. Run Container

```bash
docker-compose up -d
```

## Database Setup

1. Redis Configuration

```bash
# Start Redis
redis-server

# Verify Connection
redis-cli ping
```

## Testing Environment

1. Setup Test Database

```bash
bun run setup:test-db
```

2. Run Test Suite

```bash
bun run test
```

## Debugging

1. Vue DevTools Setup

- Install Vue DevTools browser extension
- Enable Vue DevTools in development

2. Debug Configuration

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Debug Vue",
      "url": "http://localhost:3000",
      "webRoot": "${workspaceFolder}"
    }
  ]
}
```

## Performance Testing

1. Setup Performance Testing

```bash
bun run setup:perf
```

2. Run Performance Tests

```bash
bun run test:perf
```

## Common Issues

1. Socket Connection Issues

- Verify Redis is running
- Check environment variables
- Confirm port availability

2. Build Issues

- Clear node_modules
- Update dependencies
- Check TypeScript version

## Development Guidelines

1. Code Style

- Follow TypeScript guidelines
- Use Vue composition API
- Implement proper error handling

2. Testing

- Write unit tests for new features
- Update integration tests
- Maintain E2E test coverage

3. Documentation

- Update API documentation
- Add code comments
- Update README when needed

## Deployment

1. Production Build

```bash
bun run build
```

2. Docker Deployment

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Monitoring

1. Setup Monitoring

```bash
bun run setup:monitoring
```

2. View Metrics

```bash
bun run metrics
```

## Support

For issues:

1. Check documentation
2. Review common issues
3. Create detailed bug report
4. Contact team lead
