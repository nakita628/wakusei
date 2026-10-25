import * as z from 'zod'

export const ErrorSchema = z.object({ message: z.string() })

export type ErrorSchema = z.infer<typeof ErrorSchema>

export const TodoStatusSchema = z.enum(['open', 'done'])

export type TodoStatusSchema = z.infer<typeof TodoStatusSchema>

export const TodoSchema = z.object({
  id: z.int().min(1),
  title: z.string().min(1).max(100),
  status: TodoStatusSchema,
  createdAt: z.iso.datetime({ offset: true }),
})

export type TodoSchema = z.infer<typeof TodoSchema>

export const CreateTodoSchema = z.object({ title: z.string().min(1).max(100) })

export type CreateTodoSchema = z.infer<typeof CreateTodoSchema>

export const UpdateTodoSchema = z.object({
  title: z.string().min(1).max(100).exactOptional(),
  status: TodoStatusSchema.exactOptional(),
})

export type UpdateTodoSchema = z.infer<typeof UpdateTodoSchema>
