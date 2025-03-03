# Chime Transcript Test Harness

A React application to test and validate different versions of the Amazon Chime meeting transcript capture script.

## Purpose

This tool was created to test and fix issues with the Chime Meeting Transcript Copier TamperMonkey script. The script helps users capture and save transcripts from Amazon Chime meetings, but version 2.9 introduced a bug causing duplicate lines in certain situations.

## Features

- Interactive test harness to evaluate transcript processing behavior
- Side-by-side comparison of different script versions
- Script file viewer and downloader
- Detailed explanation of the fix implementation

## Issue Summary

The primary issue in version 2.9 is in the text comparison logic used to determine if a new caption should update an existing line or be added as a new line. The problem occurs when Chime's transcription service corrects earlier parts of a sentence or when small punctuation/spacing differences exist.

## Fix Description

The fix implements a more robust text comparison algorithm that:

- Normalizes text by removing punctuation and standardizing spaces
- Uses bidirectional prefix matching (checking if either text starts with the other)
- Compares core sections of text to handle corrections in the middle
- Analyzes word similarity for longer texts with more complex differences

## Getting Started

### Prerequisites

- Node.js 16+ and npm

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm run dev
   ```
4. Open http://localhost:3000 in your browser

## Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm run serve` - Preview the production build
- `npm run format` - Format code with Prettier

## Technologies Used

- React
- TypeScript
- Vite
- Tailwind CSS
- Prettier