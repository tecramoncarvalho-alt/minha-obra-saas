import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { atualizarStorageUsado } from '@/app/lib/apontamentos'

const MAX_BYTES = 1 * 1024 * 1024 // 1 MB server-side

// Valida tipo via magic bytes (não confia em filename ou Content-Type)
function detectarTipoImagem(buf: Uint8Array): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp'
  return null
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const formData = await request.formData()
  const arquivo = formData.get('arquivo') as File | null
  const atividadeIdStr = formData.get('atividade_id') as string | null
  const dataMedicao = (formData.get('data_medicao') as string | null) ?? new Date().toISOString().slice(0, 10)
  const responsavel = formData.get('responsavel') as string | null
  const apontamentoId = (formData.get('apontamento_id') as string | null) ?? null

  if (!arquivo || !atividadeIdStr) {
    return NextResponse.json({ error: 'arquivo e atividade_id são obrigatórios.' }, { status: 400 })
  }

  const atividadeId = parseInt(atividadeIdStr, 10)
  if (isNaN(atividadeId)) return NextResponse.json({ error: 'atividade_id inválido.' }, { status: 400 })

  // Tamanho server-side
  if (arquivo.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Arquivo excede 1 MB.' }, { status: 413 })
  }

  const buffer = new Uint8Array(await arquivo.arrayBuffer())

  // Valida tipo via magic bytes
  const tipoDetectado = detectarTipoImagem(buffer)
  if (!tipoDetectado) {
    return NextResponse.json({ error: 'Tipo de arquivo não suportado. Use JPEG, PNG ou WebP.' }, { status: 400 })
  }

  // Verifica que a atividade pertence à empresa do usuário
  const { data: atividadeRow } = await supabase
    .from('atividades')
    .select('id, pavimento_id, pavimentos!inner(obra_id, obras!inner(empresa_id))')
    .eq('id', atividadeId)
    .single()

  if (!atividadeRow) {
    return NextResponse.json({ error: 'Atividade não encontrada.' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const empresaId = (atividadeRow as any).pavimentos?.obras?.empresa_id as string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obraId = (atividadeRow as any).pavimentos?.obra_id as number | undefined

  if (!empresaId) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 })

  const { data: membership } = await supabase
    .from('usuarios_empresas')
    .select('role')
    .eq('user_id', user.id)
    .eq('empresa_id', empresaId)
    .single()

  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  // Gera path único no bucket
  const ext = tipoDetectado === 'image/png' ? 'png' : tipoDetectado === 'image/webp' ? 'webp' : 'jpg'
  const timestamp = Date.now()
  const uuid = crypto.randomUUID()
  const path = `medicoes/${empresaId}/${obraId}/${atividadeId}/${timestamp}-${uuid}.${ext}`

  // Upload para Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('medicoes')
    .upload(path, buffer, { contentType: tipoDetectado, upsert: false })

  if (uploadError) {
    await supabase.from('logs_upload').insert({
      obra_id: obraId,
      arquivo_nome: arquivo.name,
      arquivo_tamanho: arquivo.size,
      bucket: 'medicoes',
      status: 'falha',
      erro_mensagem: uploadError.message,
      user_id: user.id,
    })
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from('medicoes').getPublicUrl(path)

  // Cria registro em medicoes
  const { data: medicao, error: medicaoError } = await supabase
    .from('medicoes')
    .insert({
      atividade_id: atividadeId,
      apontamento_id: apontamentoId,
      data_medicao: dataMedicao,
      foto_url: publicUrl,
      responsavel: responsavel ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (medicaoError) {
    await supabase.from('logs_upload').insert({
      obra_id: obraId,
      arquivo_nome: arquivo.name,
      arquivo_tamanho: arquivo.size,
      bucket: 'medicoes',
      status: 'falha',
      erro_mensagem: medicaoError.message,
      user_id: user.id,
    })
    return NextResponse.json({ error: medicaoError.message }, { status: 500 })
  }

  // Atualiza quota de storage
  try {
    await atualizarStorageUsado(supabase, empresaId, arquivo.size)
  } catch {
    // Não falha o upload por erro de quota; apenas loga
    console.error('Erro ao atualizar quota de storage')
  }

  // Log de sucesso
  await supabase.from('logs_upload').insert({
    obra_id: obraId,
    arquivo_nome: arquivo.name,
    arquivo_tamanho: arquivo.size,
    bucket: 'medicoes',
    status: 'sucesso',
    user_id: user.id,
  })

  return NextResponse.json({ foto_url: publicUrl, medicao_id: medicao.id }, { status: 201 })
}
