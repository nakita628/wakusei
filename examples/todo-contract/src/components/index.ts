import * as v from 'valibot'

export const ErrorSchema = v.object({ message: v.string() })

export type ErrorSchema = v.InferOutput<typeof ErrorSchema>

export const TodoStatusSchema = v.picklist(['open', 'done'])

export type TodoStatusSchema = v.InferOutput<typeof TodoStatusSchema>

export const TodoSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1)),
  title: v.pipe(v.string(), v.minCodePoints(1), v.maxCodePoints(100)),
  status: TodoStatusSchema,
  createdAt: v.pipe(
    v.string(),
    v.regex(
      /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|([+-](?:[01]\d|2[0-3]):[0-5]\d)))$/,
    ),
  ),
})

export type TodoSchema = v.InferOutput<typeof TodoSchema>

export const CreateTodoSchema = v.object({
  title: v.pipe(v.string(), v.minCodePoints(1), v.maxCodePoints(100)),
})

export type CreateTodoSchema = v.InferOutput<typeof CreateTodoSchema>

export const UpdateTodoSchema = v.partial(
  v.object({
    title: v.pipe(v.string(), v.minCodePoints(1), v.maxCodePoints(100)),
    status: TodoStatusSchema,
  }),
)

export type UpdateTodoSchema = v.InferOutput<typeof UpdateTodoSchema>
