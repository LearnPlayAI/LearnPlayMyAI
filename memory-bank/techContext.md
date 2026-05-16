# LearnPlay Tech Context

## Technologies Used

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI component library |
| TypeScript | 5.6.3 | Static type checking |
| Vite | 5.4.19 | Build tool and dev server |
| TailwindCSS | 3.4.17 | Utility-first CSS framework |
| Radix UI | Various | Accessible headless components |
| wouter | 3.3.5 | Lightweight routing |
| React Hook Form | 7.55.0 | Form handling |
| Zod | 3.24.2 | Schema validation |
| Zod Validation Error | 3.4.0 | User-friendly error messages |
| Framer Motion | 11.18.2 | Animations |
| Recharts | 2.15.4 | Data visualization |
| @tanstack/react-query | 5.60.5 | Server state management |
| socket.io-client | 4.8.1 | Real-time client communication |

### Additional UI Components
| Technology | Purpose |
|---|---|
| embla-carousel-react | Carousel/slider components |
| vaul | Drawer component |
| cmdk | Command palette |
| input-otp | OTP input fields |
| react-day-picker | Date picker |
| react-resizable-panels | Resizable panel layouts |
| lucide-react | Icon library |
| react-icons | Additional icons |
| flag-icons | Country flag icons |
| canvas-confetti | Confetti animations |

### Date/Utility Libraries
| Technology | Purpose |
|---|---|
| date-fns | Date manipulation |
| date-fns-tz | Timezone support |
| clsx + tailwind-merge | Conditional class names |
| class-variance-authority | Component variants |
| next-themes | Theme toggling |

### Document Processing
| Technology | Purpose |
|---|---|
| pdf-parse | PDF text extraction |
| pdfkit | PDF generation |
| mammoth | DOCX reading |
| docx | DOCX creation |
| fast-xml-parser | XML parsing |
| pptx-in-html-out | PPTX to HTML conversion |
| pptx-preview | PPTX preview rendering |
| sharp | Image processing |

### File Upload
| Technology | Purpose |
|---|---|
| @uppy/core | File upload core |
| @uppy/dashboard | Upload dashboard UI |
| @uppy/aws-s3 | S3-compatible uploads |

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Express.js | 4.21.2 | HTTP server framework |
| Socket.IO | 4.8.1 | Real-time communication |
| ws | 8.18.0 | WebSocket implementation |
| Passport.js | 0.7.0 | Authentication |
| passport-local | 1.0.38 | Local auth strategy |
| express-session | 1.18.2 | Session management |
| connect-pg-simple | 7.0.3 | PostgreSQL session store |
| bcrypt | 6.0.0 | Password hashing |
| multer | 2.0.2 | File upload parsing |
| nodemailer | 8.0.1 | Email sending |
| memoizee | 0.4.17 | Function result caching |
| open-id-client | 6.7.1 | OpenID Connect support |
| archiver | 7.0.1 | Archive creation |
| unzipper | 0.12.3 | Archive extraction |
| axios | 1.13.2 | HTTP client |

### Database
| Technology | Version | Purpose |
|---|---|---|
| PostgreSQL | Latest | Primary database |
| Drizzle ORM | 0.39.1 | Type-safe ORM |
| Drizzle Kit | 0.30.4 | Migration tooling |
| drizzle-zod | 0.7.0 | Schema-to-Zod |
| @neondatabase/serverless | 0.10.4 | Neon serverless driver |

### Cloud/Storage
| Technology | Purpose |
|---|---|
| @google-cloud/storage | Google Cloud Storage |
| @replit/object-storage | Replit object storage |
| @google/genai | Google Generative AI |

### Testing
| Technology | Version | Purpose |
|---|---|---|
| Jest | 30.2.0 | Test runner |
| ts-jest | 29.4.5 | TypeScript support |
| Supertest | 7.1.4 | HTTP assertions |
| @jest/globals | 30.2.0 | Global test functions |
| @types/jest | 30.0.0 | TypeScript types |

## Development Setup

### Starting Development
```bash
cd Cloud-On-Prem
npm run dev              # Start dev server (tsx, single run)
npm run dev:watch        # Start dev server with file watcher
```

### Building
```bash
npm run build            # Full production build (Vite + esbuild)
```

### Database
```bash
npm run db:push                # Push schema to database
```

### Testing
```bash
npm run test                    # Full test suite
npm run test:server             # Backend tests only
npm run test:client             # Frontend tests only
npm run test:viewer-critical    # Critical path tests
npm run coverage                # Coverage report
```

### Validation
```bash
npm run check            # Full validation suite
```

## Technical Constraints

### Environment
- **TypeScript strictly enforced** - All code fully typed
- **Zod runtime validation** - All external inputs validated at boundaries
- **Drizzle ORM preferred** - Raw SQL only when necessary
- **No hardcoded secrets** - Use environment variables/secrets manager
- **Browser testing** - ONLY use webclaw MCP tool (never Playwright)

### Build Constraints
- **Vite build** for frontend (output: `dist/public`)
- **esbuild bundle** for backend (output: `dist/index.js`)
- **Node.js ESM** module system (`"type": "module"`)
- **TSX** for server-side TypeScript execution

### Database Constraints
- **Migration-driven schema** - All changes via SQL migrations
- **Sequential migration numbering** - 0001_, 0002_, etc.
- **Snake case for DB** - Columns and tables use snake_case
- **Foreign key integrity** - Referential constraints enforced

## Dependencies Management

### Key Configuration Files
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `vite.config.ts` - Vite build configuration
- `tailwind.config.ts` - TailwindCSS configuration
- `drizzle.config.ts` - Drizzle ORM configuration
- `jest.config.js` - Jest test configuration
- `postcss.config.js` - PostCSS processing

### Path Aliases (Vite)
- `@` → `client/src`
- `@shared` → `shared`
- `@assets` → `attached_assets`