# NutriSense

A personal health intelligence app designed to surface connections between what you consume, how you move, and how your body and mind respond.

Most health apps track data in silos. NutriSense logs food, activity, biometrics, and mood together — then uses Claude to analyze patterns across all of it and surface insights you wouldn't find by looking at any single dimension alone.

## What it does

**Logging**
- Food via natural language ("I had a bowl of oatmeal with blueberries")
- Food via photo — Claude identifies the meal and estimates nutritional content
- Food via barcode scan — pulls structured data from the Open Food Facts API and USDA food database
- Activity and exercise
- Biometrics (weight, sleep, and other physical measurements)
- Mood and energy levels

**Analysis**
- Claude actively analyzes logged data to surface trends and connections across categories
- Designed around a core hypothesis: the relationships between what we consume, how we move, and how we feel are more revealing than any single metric in isolation

## Tech stack

- **Frontend:** React / Next.js
- **Backend / Database:** Supabase
- **Deployment:** Vercel
- **AI:** Claude API (Anthropic) — natural language logging, food photo recognition, trend analysis
- **Data:** Open Food Facts API, USDA FoodData Central API

## Why I built this

I'm a finance systems leader who started building applications with Claude Code over the last few months. NutriSense is the most ambitious of those projects — an attempt to build something genuinely useful that also pushed me to integrate multiple APIs, design a real data model, and deploy a production application from scratch with no formal engineering background.

The hypothesis behind the app is personal: I wanted to understand how the things I do daily connect to how I feel and perform. The quantified self space has a lot of trackers. It has fewer tools that actually help you think about the data.

## Status

Live and in active development. Currently in personal use with ongoing feature development.

## Author

Connor Vander Zalm
[cvanderzalm.com](https://cvanderzalm.com) · [LinkedIn](https://linkedin.com/in/connorvanderzalmmba)
