import * as z from 'zod'

export const TodoSchema = z.object({ id: z.string(), title: z.string(), done: z.boolean() })

export type TodoSchema = z.infer<typeof TodoSchema>
