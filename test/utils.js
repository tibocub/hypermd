const list = hypersite.getElementById('post-list')
const input = hypersite.getElementById('username')
const btn = hypersite.getElementById('submit')

async function loadPosts() {
  const posts = await db.query().match('guest:*').in('guestbook').exec()
  list.setData(posts.map(p => p.value.name))
}

btn.on('press', async () => {
  const name = input.value.trim()
  if (!name) return
  await db.put('guest:' + Date.now(), { name }, 'guestbook')
  input.clear()
  await loadPosts()
})

await loadPosts()