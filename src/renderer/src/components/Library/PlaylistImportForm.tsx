interface PlaylistImportFormProps {
  disabled: boolean
  status: string | null
  input: string
  onSubmit: () => void
  onSelectFile: () => void
  onInputChange: (input: string) => void
}

export function PlaylistImportForm({
  disabled,
  input,
  onInputChange,
  onSelectFile,
  status,
  onSubmit
}: PlaylistImportFormProps): JSX.Element {
  return (
    <form
      className="playlist-import"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <input
        aria-label="Playlist URL"
        disabled={disabled}
        placeholder="Paste playlist URL or choose an M3U file"
        type="text"
        value={input}
        onChange={(event) => onInputChange(event.currentTarget.value)}
      />
      <button disabled={disabled} type="button" onClick={onSelectFile}>
        Choose M3U
      </button>
      <button disabled={disabled || input.trim().length === 0} type="submit">
        {disabled ? 'Reading' : 'Import'}
      </button>
      {status ? <span className="playlist-import-status">{status}</span> : null}
    </form>
  )
}
