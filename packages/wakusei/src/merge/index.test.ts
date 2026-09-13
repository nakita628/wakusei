import { describe, expect, it } from 'vite-plus/test'

import { mergeProcedureFile } from './index.js'

describe('mergeProcedureFile', () => {
  it('should preserve existing handler body', () => {
    const existing = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return db.posts.findMany()})
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{})
`
    const result = mergeProcedureFile(existing, generated)
    expect(result).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        '\n' +
        "export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{return db.posts.findMany()})\n",
    )
  })

  it('should not preserve stub handler body', () => {
    const existing = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{})
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number()})).handler(async({input})=>{})
`
    const result = mergeProcedureFile(existing, generated)
    expect(result).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        '\n' +
        "export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number()})).handler(async({input})=>{})\n",
    )
  })

  it('should add new procedures from generated', () => {
    const existing = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return []})
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{})

export const createPost=os.route({method:'POST',path:'/posts'}).input(z.object({title:z.string()})).handler(async({input})=>{})
`
    const result = mergeProcedureFile(existing, generated)
    expect(result).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        '\n' +
        "export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return []})\n" +
        '\n' +
        "export const createPost=os.route({method:'POST',path:'/posts'}).input(z.object({title:z.string()})).handler(async({input})=>{})\n",
    )
  })

  it('should remove deleted procedures', () => {
    const existing = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return []})

export const oldProc=os.route({method:'GET',path:'/old'}).input(z.object({})).handler(async({input})=>{return 'old'})
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{})
`
    const result = mergeProcedureFile(existing, generated)
    expect(result).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        '\n' +
        "export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return []})\n",
    )
  })

  it('should preserve user imports', () => {
    const existing = `import {os} from '@orpc/server'
import * as z from 'zod/v4'
import {db} from '../db.js'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return db.find()})
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{})
`
    const result = mergeProcedureFile(existing, generated)
    expect(result).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        "import {db} from '../db.js'\n" +
        '\n' +
        "export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return db.find()})\n",
    )
  })

  it('should preserve .use() before .route()', () => {
    const existing = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.use(authMiddleware).route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return db.find()})
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{})
`
    const result = mergeProcedureFile(existing, generated)
    expect(result).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        '\n' +
        "export const listPosts=os.use(authMiddleware).route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{return db.find()})\n",
    )
  })

  it('should preserve .use() between .input() and .output()', () => {
    const existing = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).use(logMiddleware,input=>input).output(z.object({items:z.array(z.string())})).handler(async({input})=>{return {items:[]}})
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).output(z.object({items:z.array(z.string())})).handler(async({input})=>{})
`
    const result = mergeProcedureFile(existing, generated)
    expect(result).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        '\n' +
        "export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).use(logMiddleware, input=>input).output(z.object({items:z.array(z.string())})).handler(async({input})=>{return {items:[]}})\n",
    )
  })

  it('should preserve multiple chained .use() calls', () => {
    const existing = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.use(auth).use(rateLimit).route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return []})
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{})
`
    const result = mergeProcedureFile(existing, generated)
    expect(result).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        '\n' +
        "export const listPosts=os.use(auth).use(rateLimit).route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return []})\n",
    )
  })

  it('should preserve .callable() after .handler()', () => {
    const existing = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return result}).callable()
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{})
`
    const result = mergeProcedureFile(existing, generated)
    expect(result).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        '\n' +
        "export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{return result}).callable()\n",
    )
  })

  it('should preserve .callable().actionable() after .handler()', () => {
    const existing = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const createPost=os.route({method:'POST',path:'/posts'}).input(z.object({title:z.string()})).handler(async({input})=>{return db.create(input)}).callable().actionable()
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const createPost=os.route({method:'POST',path:'/posts'}).input(z.object({title:z.string()})).handler(async({input})=>{})
`
    const result = mergeProcedureFile(existing, generated)
    expect(result).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        '\n' +
        "export const createPost=os.route({method:'POST',path:'/posts'}).input(z.object({title:z.string()})).handler(async({input})=>{return db.create(input)}).callable().actionable()\n",
    )
  })

  it('should preserve .use() + handler body + .callable() together', () => {
    const existing = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.use(auth).route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return impl}).callable()
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{})
`
    const result = mergeProcedureFile(existing, generated)
    expect(result).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        '\n' +
        "export const listPosts=os.use(auth).route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{return impl}).callable()\n",
    )
  })

  it('should preserve .use() and .callable() even when handler body is stub', () => {
    const existing = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.use(auth).route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{}).callable()
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{})
`
    const result = mergeProcedureFile(existing, generated)
    expect(result).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        '\n' +
        "export const listPosts=os.use(auth).route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{}).callable()\n",
    )
  })

  it('should be idempotent: merge result merged again yields same result', () => {
    const userEdited = `import {os} from '@orpc/server'
import * as z from 'zod/v4'
import {db} from '../db.js'

export const listPosts=os.use(auth).route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return db.posts.findMany()}).callable()
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{})
`
    const first = mergeProcedureFile(userEdited, generated)
    const second = mergeProcedureFile(first, generated)
    expect(second).toBe(first)
  })

  it('should be idempotent for stub-only procedures', () => {
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{})
`
    const first = mergeProcedureFile(generated, generated)
    const second = mergeProcedureFile(first, generated)
    expect(second).toBe(first)
  })

  it('should update input/output on spec change while preserving user customizations', () => {
    const userEdited = `import {os} from '@orpc/server'
import * as z from 'zod/v4'
import {db} from '../db.js'

export const listPosts=os.use(auth).route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).use(logMiddleware,input=>input).output(z.array(z.string())).handler(async({input})=>{return db.find()}).callable()
`
    const generatedV2 = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional(),cursor:z.string().optional()})).output(z.object({items:z.array(z.string()),next:z.string().optional()})).handler(async({input})=>{})
`
    const first = mergeProcedureFile(userEdited, generatedV2)
    expect(first).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        "import {db} from '../db.js'\n" +
        '\n' +
        "export const listPosts=os.use(auth).route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional(),cursor:z.string().optional()})).use(logMiddleware, input=>input).output(z.object({items:z.array(z.string()),next:z.string().optional()})).handler(async({input})=>{return db.find()}).callable()\n",
    )
    const second = mergeProcedureFile(first, generatedV2)
    expect(second).toBe(first)
  })

  it('should add new procedures from updated spec while preserving existing customizations', () => {
    const userEdited = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.use(auth).route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return db.find()})
`
    const generatedV2 = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{})

export const createPost=os.route({method:'POST',path:'/posts'}).input(z.object({title:z.string()})).handler(async({input})=>{})
`
    const first = mergeProcedureFile(userEdited, generatedV2)
    expect(first).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        '\n' +
        "export const listPosts=os.use(auth).route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{return db.find()})\n" +
        '\n' +
        "export const createPost=os.route({method:'POST',path:'/posts'}).input(z.object({title:z.string()})).handler(async({input})=>{})\n",
    )
    const second = mergeProcedureFile(first, generatedV2)
    expect(second).toBe(first)
  })

  it('should preserve customized procedure and leave stub unchanged across re-generations', () => {
    const userEdited = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.use(auth).route({method:'GET',path:'/posts'}).input(z.object({})).handler(async({input})=>{return db.find()}).callable()

export const createPost=os.route({method:'POST',path:'/posts'}).input(z.object({title:z.string()})).handler(async({input})=>{})
`
    const generated = `import {os} from '@orpc/server'
import * as z from 'zod/v4'

export const listPosts=os.route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{})

export const createPost=os.route({method:'POST',path:'/posts'}).input(z.object({title:z.string(),body:z.string()})).handler(async({input})=>{})
`
    const first = mergeProcedureFile(userEdited, generated)
    expect(first).toBe(
      "import {os} from '@orpc/server'\n" +
        "import * as z from 'zod/v4'\n" +
        '\n' +
        "export const listPosts=os.use(auth).route({method:'GET',path:'/posts'}).input(z.object({limit:z.number().optional()})).handler(async({input})=>{return db.find()}).callable()\n" +
        '\n' +
        "export const createPost=os.route({method:'POST',path:'/posts'}).input(z.object({title:z.string(),body:z.string()})).handler(async({input})=>{})\n",
    )
    const second = mergeProcedureFile(first, generated)
    expect(second).toBe(first)
  })

  it('drops an import from a managed module the generated file no longer imports', () => {
    const existing = `import {os} from '@orpc/server'
import {PostSchema} from '@/schemas'
import {db} from '../db.js'

export const listPosts=os.route({method:'GET',path:'/posts'}).output(PostSchema).handler(async({input})=>{return db.find()})
`
    const generated = `import {os} from '@orpc/server'

export const listPosts=os.route({method:'GET',path:'/posts'}).handler(async({input})=>{})
`
    expect(mergeProcedureFile(existing, generated, new Set(['@/schemas']))).toBe(
      "import {os} from '@orpc/server'\n" +
        "import {db} from '../db.js'\n" +
        '\n' +
        "export const listPosts=os.route({method:'GET',path:'/posts'}).handler(async({input})=>{return db.find()})\n",
    )
  })

  it('keeps the implement(contract) preamble of a contract handler file', () => {
    const existing = `import {implement} from '@orpc/server'
import {contract} from '../contract'

const os=implement(contract)

export const getPosts=os.getPosts.use(auth).handler(async({input})=>{return []})
export const postPosts=os.postPosts.handler(async({input})=>{})
`
    const generated = `import {implement} from '@orpc/server'
import {contract} from '../contract'

const os=implement(contract)

export const getPosts=os.getPosts.handler(async({input})=>{})
export const postPosts=os.postPosts.handler(async({input})=>{})
`
    expect(mergeProcedureFile(existing, generated, new Set(['../contract']))).toBe(
      "import {implement} from '@orpc/server'\n" +
        "import {contract} from '../contract'\n" +
        '\n' +
        'const os=implement(contract)\n' +
        '\n' +
        'export const getPosts=os.getPosts.use(auth).handler(async({input})=>{return []})\n' +
        '\n' +
        'export const postPosts=os.postPosts.handler(async({input})=>{})\n',
    )
  })

  it('returns the generated file as is when the existing one has no procedures', () => {
    const generated = `import {os} from '@orpc/server'

export const listPosts=os.route({method:'GET',path:'/posts'}).handler(async({input})=>{})
`
    expect(mergeProcedureFile('// emptied by hand\n', generated)).toBe(generated)
  })
})
