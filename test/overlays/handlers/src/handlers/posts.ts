// Handler bodies a user wrote before regenerating. Only the `.handler(...)` bodies matter:
// wakusei merges them into the regenerated procedures, which is part of what the cases
// that copy this overlay check. On its own this file is not valid (`os` is the generated
// chain's), so it is left out of lint and typecheck; the merged result is checked instead.

export const getPosts = os.handler(async ({ input }) => {
  return [{ id: input.limit ?? 1, title: 'post', status: input.status ?? 'draft' }]
})

export const postPosts = os.handler(async ({ input }) => {
  return { id: 1, title: input.title, status: 'draft' }
})

export const getPostsPostId = os.handler(async ({ input }) => {
  return {
    id: input.postId,
    title: 'post',
    status: 'published',
    replies: [{ id: input.postId + 1, title: 'reply', status: 'draft' }],
    author: { name: 'author', posts: [] },
  }
})

export const putPostsPostId = os.handler(async ({ input }) => {
  return { id: input.postId, title: input.title ?? 'untitled', status: 'draft' }
})

export const deletePostsPostId = os.handler(async () => {
  return undefined
})
