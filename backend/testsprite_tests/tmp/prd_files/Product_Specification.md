# RepoMind Backend - Product Specification Document (PSD)

## 1. Product Overview
**RepoMind** is an AI-powered developer assistant capable of ingesting GitHub repositories, parsing code architecture, and providing a conversational interface (RAG) to explore and explain the codebase. The backend serves as the core orchestration layer, responsible for repository fetching, text chunking, generative AI embeddings preparation, multi-turn chat generation, and Abstract Syntax Tree (AST) dependency parsing.

### 1.1 Goal
Provide a robust, scalable backend API that bridges GitHub repositories with LLM-powered context understanding and graph-based codebase visualization.

## 2. Tech Stack & Architecture
- **Language & Runtime:** Node.js (ES Modules)
- **Framework:** Express.js
- **Database:** MongoDB (via Mongoose), utilizing MongoDB Atlas Vector Search
- **AI / LLM Integration:** Google Gemini API (`@google/genai`, `@google/generative-ai`)
- **AST Parsing:** Babel (`@babel/parser`, `@babel/traverse`) for JavaScript/TypeScript dependency trees.

## 3. Core Features

### 3.1 Repository Ingestion
The ingestion engine uses GitHub's Trees API to extract all files from a remote repository, ignoring unnecessary files (e.g., node_modules, binaries). It fetches the codebase, chunks the text, invokes the Gemini Embedding model (`gemini-embedding-001`), and stores the embeddings for vector search.

### 3.2 Retrieval-Augmented Generation (RAG) Chat
A multi-turn Server-Sent Events (SSE) streaming chat system. 
- Performs Cosine Similarity matching to retrieve relevant code chunks.
- Injects repository context and chat history into the Gemini Prompt (`gemini-2.5-flash`).
- Instructs the AI to generate Mermaid.js diagrams for structural/architectural queries.

### 3.3 Dependency Parser & File Graph
Uses Babel to traverse Abstract Syntax Trees (AST) in JS/TS source files.
- Extracts ES Import/Export operations.
- Automatically resolves local and bare module paths.
- Detects Application Insights: circular dependencies, dead files, and highly-connected components.
- Builds a directory tree matching a standard IDE file explorer.

### 3.4 AI Intelligence & Automation
- **Codebase Summarization:** Automatically builds a developer-friendly executive summary using the `package.json`, `README.md`, and top-level index files.
- **Starter Suggestions:** Scans codebase samples to dynamically generate 4 relevant onboarding developer questions.

## 4. RESTful API Endpoints

### 4.1 `POST /api/ingest`
- **Purpose**: Initiates the ingestion of a GitHub repository.
- **Payload**: `{ "repoUrl": "https://github.com/owner/repo" }`
- **Process**: Fetches repo, builds chunks, calculates embeddings, saves to DB. 
- **Response**: Ingestion statistics (files processed, chunks created).

### 4.2 `POST /api/chat`
- **Purpose**: Multi-turn SSE chat streaming endpoint.
- **Payload**: `{ "repoUrl": "url", "question": "string", "history": [{"role": "user|model", "content": "string"}] }`
- **Process**: Calculates cosine similarity against DB chunks, streams Gemini 2.5 response via SSE.

### 4.3 `GET /api/suggestions`
- **Purpose**: Generates dynamic onboarding questions based on the repo’s context.
- **Query Params**: `?repoUrl=...`
- **Response**: `{ "suggestions": ["Question 1", "Question 2", ...] }`

### 4.4 `GET /api/summary`
- **Purpose**: Retrieves an AI-generated concise summary of the repository.
- **Query Params**: `?repoUrl=...`
- **Response**: `{ "summary": "Markdown text" }`

### 4.5 `GET /api/structure`
- **Purpose**: Retrieves the codebase AST dependency graph, file tree, and graph insights.
- **Query Params**: `?repoUrl=...`
- **Response**: `{ "nodes": [], "edges": [], "tree": [], "insights": { "circularDependencies": [], ... } }`

### 4.6 `GET /api/file`
- **Purpose**: Retrieves the raw content of a specific file.
- **Query Params**: `?repoUrl=...&filePath=...`
- **Response**: `{ "repoUrl": "...", "filePath": "...", "content": "..." }`

## 5. Data Models (MongoDB)

### 5.1 `RepoFile` Schema
Stores the full, un-chunked content of repository files.
- `repoUrl` (String, Indexed)
- `filePath` (String, Indexed)
- `content` (String)

### 5.2 `RepoDocument` Schema
Stores the embedded chunks used by the RAG service.
- `repoUrl` (String, Indexed)
- `filePath` (String)
- `content` (String)
- `chunkIndex` (Number)
- `embedding` (Array of Numbers - Vector Search Index Target)

## 6. Known Limitations / Future Scope
1. **API Rate Limits**: Ingestion currently fetches files sequentially/batched and could hit GitHub REST API limits for extremely large repositories without authentication.
2. **Language Support for AST**: The Dependency Graph currently assumes JavaScript/TypeScript files, powered by Babel. For complete enterprise capability, extending support to Java, Python, or Go via `tree-sitter` should be considered.
3. **Chunking Strategy**: RAG chunks are currently basic text splits. Semantic chunking based on AST nodes (classes, functions) could improve relevance scoring.
