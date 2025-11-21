# NEAR AI Chat Agent Starter Kit

A starter template for building AI-powered chat agents using Cloudflare's [`agents`](https://www.npmjs.com/package/agents) library. This project provides a foundation for building interactive chat experiences on NEAR AI Cloud, which supports verifiably private inference.

## Prerequisites

- [Cloudflare account](https://www.cloudflare.com)
- [NEAR AI Cloud API key](https://cloud.near.ai)

## Quick Start

1. Create a new project:

```bash
npx create-cloudflare@latest --template cloudflare/agents-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up your environment:

Create a `.dev.vars` file:

```env
NEARAI_CLOUD_API_KEY=your_near_ai_cloud_api_key
```

Deploy as a secret for Workers:

```bash
wrangler secret put NEARAI_CLOUD_API_KEY
```

4. Run locally:

```bash
npm start
```

5. Deploy:

```bash
npm run deploy
```

## License

MIT
