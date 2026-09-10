import { render, screen } from '@testing-library/react'
import MarkdownContent from '../components/MarkdownContent'

describe('MarkdownContent', () => {
  it('renderiza a estrutura Markdown usada nos relatórios', () => {
    render(
      <MarkdownContent>
        {'# Título\n\n**Fato** documentado.\n\n- item um\n- item dois\n\n> citação\n\n| Estratégia | Status |\n| --- | --- |\n| Grafo | OK |'}
      </MarkdownContent>
    )

    expect(screen.getByRole('heading', { name: 'Título' })).toBeInTheDocument()
    expect(screen.getByText('Fato')).toBeInTheDocument()
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByRole('blockquote')).toHaveTextContent('citação')
    expect(screen.getByRole('table')).toHaveTextContent('Grafo')
    expect(screen.queryByText('**Fato**')).not.toBeInTheDocument()
  })

  it('remove HTML executável e mantém o conteúdo seguro', () => {
    const { container } = render(
      <MarkdownContent>{'<script>alert("x")</script>\n\nTexto seguro.'}</MarkdownContent>
    )

    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText('Texto seguro.')).toBeInTheDocument()
  })
})
