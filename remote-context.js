export const name = 'remote-context'
export const inject = ['systemPrompt']

export function apply(ctx) {
  ctx.effect(() => ctx.systemPrompt.context({
    name: 'remote-ssh-workspace',
    order: 60,
    text: () => {
      const binding = ctx.get('remoteSshWorkspace')?.current?.()
      if (!binding) return ''
      return [
        `Remote SSH workspace: ${binding.host}:${binding.remotePath}.`,
        'Filesystem, bash, and jobs tools operate on this remote host; never use local paths.',
      ].join(' ')
    },
  }), 'remote-context: workspace binding')
}
