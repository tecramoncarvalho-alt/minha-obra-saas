# Minha Obra

SaaS multi-tenant de gestão de obras com Linha de Balanço, apontamentos diários e monitoramento planejado vs. real.

---

## O que o sistema faz

**Minha Obra** é uma plataforma web para gestão de obras civis baseada na metodologia de **Linha de Balanço** — representação visual do ritmo de execução de cada atividade por pavimento ao longo do tempo. O sistema cobre o ciclo completo: planejamento → execução diária → análise de desvios.

**Fluxo principal:**
1. Engenheiro cria a obra, define blocos/pavimentos e programa atividades na linha de balanço
2. Encarregados registam diariamente efetivo real, % executado e fotos de medição
3. Dashboard compara planejado vs. real com KPIs, Curva S e alertas automáticos

---

## Stack

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js App Router | 16.2.4 |
| UI | React + TypeScript | 19 / 5 |
| Estilo | Tailwind CSS v4 (sem shadcn/ui) | 4 |
| Banco | Supabase (PostgreSQL + Storage) | — |
| Auth | Supabase Auth SSR + proxy.ts | 0.10.2 |
| Cache | React Query (@tanstack/react-query) | 5.100.9 |
| Gráficos | Recharts (apenas CurvaS.tsx) | 3.8.1 |
| Upload | browser-image-compression + retry | 2.0.2 |
| Validação | Zod | 4.4.2 |
| Testes | Vitest | 4.1.5 |
| Deploy | Vercel (branch `main`) | — |

---

## Arquitetura

```
plansaas/
├── proxy.ts                           # Middleware de autenticação (NÃO é middleware.ts)
├── app/
│   ├── layout.tsx                     # RootLayout — envolve tudo com <AuthProvider>
│   ├── providers.tsx                  # AuthProvider + QueryClientProvider + ReactQueryDevtools
│   ├── calendario.ts                  # FONTE DE VERDADE para cálculos de dias úteis
│   ├── page.tsx                       # Home: lista e criação de obras
│   ├── login/page.tsx                 # Login email+senha e Google OAuth
│   ├── signup/page.tsx                # Cadastro com confirmação por email
│   ├── setup/page.tsx                 # Primeiro acesso: criar empresa
│   ├── auth/callback/route.ts         # Callback PKCE (code) e OTP (token_hash)
│   ├── api/
│   │   ├── me/route.ts                         # GET: usuário + empresa (service_role, sem RLS)
│   │   ├── invite/route.ts                     # POST: convite de membro via service role
│   │   ├── empresa/[id]/storage-quota/route.ts # GET: quota de storage da empresa
│   │   ├── medicoes/upload/route.ts            # POST: upload foto (magic bytes, máx 1MB)
│   │   └── obras/[id]/
│   │       ├── apontamentos/route.ts            # GET (filtros data/range) + POST
│   │       └── apontamentos/[id]/route.ts       # PUT + DELETE
│   ├── configuracoes/equipe/page.tsx  # Gestão de membros (admin only)
│   ├── lib/
│   │   ├── types.ts                   # Interfaces centralizadas (Obra, Atividade, ApontamentoDiario…)
│   │   ├── schemas.ts                 # Validações Zod (ApontamentoDiarioSchema, MedicaoSchema)
│   │   ├── calculador-avanco.ts       # Funções puras: desvio, CurvaS, deltaEfetivo, resumoObra
│   │   ├── apontamentos.ts            # Helpers de BD: getters, setters, quota de storage
│   │   ├── upload-helper.ts           # uploadFotoComRetry: compressão + retry exponencial
│   │   └── query-hooks.ts             # React Query hooks: useStorageQuota, useApontamentosHoje
│   └── obras/[id]/
│       ├── page.tsx                   # Config da obra: pavimentos, feriados, foto de capa
│       ├── linha-balanco/
│       │   ├── page.tsx               # Orquestrador (~1370 linhas)
│       │   ├── utils/geradorCores.ts  # PALETTE, getCor, getCorSub, calcDuracaoTotal
│       │   ├── utils/helpers.ts       # fmtDate, gerarUUID
│       │   ├── hooks/
│       │   │   ├── useCalendarioAtividades.ts
│       │   │   ├── useAtividades.ts
│       │   │   ├── useVinculos.ts
│       │   │   ├── useDragAndDrop.ts
│       │   │   └── useConflitos.ts
│       │   └── components/
│       │       ├── GraficoLinhaBalanco.tsx   # Grid + barras (normal e tela cheia)
│       │       ├── ToolbarSuperior.tsx        # Zoom, filtros, toggle Avanço Real
│       │       ├── HeaderLinhaBalanco.tsx
│       │       ├── BannersLinhaBalanco.tsx
│       │       ├── LegendaCores.tsx
│       │       ├── ContextMenu.tsx
│       │       ├── TooltipAtividade.tsx
│       │       ├── TelaCheia.tsx
│       │       └── modais/ (9 modais)
│       ├── dashboard/
│       │   ├── page.tsx               # Orquestrador (~1100 linhas)
│       │   ├── utils.ts               # DashboardObra, DashboardVersao, helpers locais
│       │   ├── hooks/
│       │   │   ├── useDashboardData.ts # Fetch centralizado (obra, atividades, apontamentos)
│       │   │   ├── useKPIs.ts          # Cálculos puros com useMemo (desvio, paralisadas)
│       │   │   └── useEfetivo.ts       # Cálculos de efetivo por equipe
│       │   ├── sections/
│       │   │   ├── SectionKPIs.tsx
│       │   │   ├── SectionAlertas.tsx
│       │   │   ├── SectionCurvaS.tsx
│       │   │   ├── SectionEfetivo.tsx
│       │   │   └── SectionAtencao.tsx
│       │   └── components/
│       │       ├── KpiCards.tsx
│       │       ├── AlertasParalisadas.tsx
│       │       ├── GridEfetivo.tsx
│       │       ├── CurvaS.tsx           # AreaChart (Recharts) — única dependência do Recharts
│       │       ├── TabelaAtencao.tsx    # Filtros automáticos + drawer histórico
│       │       ├── RowHighlight.tsx
│       │       └── ModalRelatorio.tsx
│       ├── apontamentos/
│       │   ├── page.tsx               # Mobile-first, accordion, React Query, upload staged
│       │   └── components/
│       │       └── UploadFoto.tsx     # Preview local → upload só ao salvar apontamento
│       ├── criacao-em-lote/page.tsx   # Wizard bulk de blocos/pavimentos
│       └── editar-bloco/[bloco]/page.tsx
├── components/
│   └── Header.tsx                     # Header global: logo, empresa, role, logout
├── lib/supabase/client.ts             # Singleton browser client (createBrowserClient)
├── __tests__/
│   └── calculadorAvanco.test.ts       # 17 testes Vitest
└── vitest.config.ts
```

### Fluxo de autenticação

1. `proxy.ts` — intercepta todas as requisições com `getSession()` (leitura de cookie, sem rede)
2. Rotas públicas: `/login`, `/signup`, `/auth/callback`
3. Autenticado sem empresa → `/setup`
4. `AuthProvider` em `providers.tsx` carrega empresa via `/api/me` (server-side, service_role)
5. `useAuth()` expõe `{ user, empresa, role, loading, empresaFetched }` globalmente

### Clientes Supabase

| Contexto | Módulo | Uso |
|---|---|---|
| Browser | `lib/supabase/client.ts` | Singleton `createBrowserClient` — páginas e hooks |
| Server (proxy, callbacks) | inline | `createServerClient` com cookies do request |
| Admin (API routes críticas) | inline | `createClient` com `SUPABASE_SERVICE_ROLE_KEY` |

### Cache (React Query)

- `QueryClientProvider` em `providers.tsx` — staleTime 5 min, gcTime 10 min
- `useStorageQuota(empresaId)` — quota de storage, invalida após upload
- `useApontamentosHoje(obraId, data)` — apontamentos do dia, invalida após salvar
- DevTools disponíveis em desenvolvimento (painel no rodapé)
- Estrutura preparada para `persistQueryClient` + IndexedDB (PWA futuro)

---

## Funcionalidades implementadas

### Linha de Balanço
- Gráfico interativo com drag-and-drop de atividades
- Zoom por intervalo de datas + filtro por pavimento/bloco
- Vínculos de dependência entre atividades (cadeia propagada no drag)
- Subatividades por equipe com cores distintas
- Linha "Hoje" em vermelho + tooltips ao hover
- Tela cheia + impressão
- **Toggle "Avanço Real"** — sobrepõe dois segmentos em cada barra (parte executada clareada; PARALISADA com hachura diagonal)
- Versionamento com snapshots imutáveis (status Definitiva)

### Dashboard de Produtividade
- **KPI cards** — % conclusão geral, desvio em dias úteis, aderência de efetivo, atividades críticas
- **Alertas** de atividades PARALISADAS
- **Grid efetivo** — previsto vs. real com delta colorido e barras duplas
- **Curva S** — gráfico acumulado planejado vs. real em dias úteis (Recharts)
- **Tabela "Atividades em Atenção"** — filtro automático (desvio > 10%, prazo vencido, PARALISADA); drawer lateral com histórico
- Seletor de versão e de data para análise histórica

### Apontamentos Diários (mobile-first)
- Cards em **accordion**: exibem resumo colapsado, expandem ao toque
- Touch targets ≥ 44px (inputs), ≥ 48px (botões); font-size ≥ 16px (sem zoom iOS)
- **Seção "Atrasadas"** — atividades com prazo vencido e < 100% de execução
- Upload de foto **staged**: foto só sobe ao salvar o apontamento, nunca antes
  - Compressão automática (máx 0.8 MB, 1920px) via `browser-image-compression`
  - Retry com backoff exponencial (até 3 tentativas)
  - Validação de tipo via magic bytes (JPEG/PNG/WebP)
  - Barra de progresso em tempo real (0–100%)
- Toast fixo no topo (sucesso 3s / erro 4s)
- Histórico dos últimos 7 dias colapsável
- Skeleton de carregamento com animação pulse

### Gestão de Obras
- CRUD de obras com foto de capa
- Calendário por obra: sábado/domingo úteis + feriados personalizados
- Wizard de criação em lote de blocos e pavimentos
- RBAC: admin / editor / viewer com convites por email

### Storage
- Quota por empresa (plano free = 1 GB)
- Barra de quota compacta na página de apontamentos
- Log de uploads (tabela `logs_upload`)

---

## Schema da Base de Dados

```sql
-- Multi-tenancy
empresas          (id uuid PK, nome text, created_at)
usuarios_empresas (user_id uuid FK auth.users, empresa_id uuid FK empresas,
                   role text CHECK('admin','editor','viewer'), UNIQUE(user_id, empresa_id))

-- Obras
obras      (id bigint PK, empresa_id uuid FK, nome text, descricao text,
            foto_url text, data_inicio date, data_fim date,
            sabado_util bool DEFAULT false, domingo_util bool DEFAULT false)
feriados   (id bigint PK, obra_id bigint FK, data text 'YYYY-MM-DD', nome text)

-- Estrutura
pavimentos (id bigint PK, obra_id bigint FK,
            nome text,        -- "NomeBloco - NomePavimento"
            numero int,       -- ordem visual
            observacao text)  -- metadados de bloco no 1º pavimento (parseMeta/buildMeta)

-- Planejamento
atividades    (id bigint PK, pavimento_id bigint FK, nome text,
               data_inicio date, data_fim date, duracao_dias int,  -- DIAS ÚTEIS
               equipe text, efetivo int, linha_index int,
               vinculo_id text, vinculo_ordem int)
subatividades (id bigint PK, atividade_id bigint FK, nome text,
               duracao int, equipe text, efetivo int, ordem int)

-- Registro Real
apontamentos_diarios (id uuid PK, atividade_id bigint FK,
                      data text 'YYYY-MM-DD', efetivo_real int,
                      percentual_executado int,
                      status text CHECK('NAO_INICIADA','INICIADA','EM_ANDAMENTO',
                                        'CONCLUIDA_NO_DIA','PARALISADA') DEFAULT 'EM_ANDAMENTO',
                      observacao text, responsavel text,
                      created_by uuid FK, created_at, updated_at)

-- Medições com Fotos
medicoes (id uuid PK, atividade_id bigint FK, apontamento_id uuid FK,
          data_medicao text 'YYYY-MM-DD', quantidade_executada numeric,
          unidade text, responsavel text, foto_url text,
          observacao text, created_by uuid FK, created_at)

-- Storage e Auditoria
storage_quotas (id uuid PK, empresa_id uuid FK,
                storage_usado_bytes bigint, storage_limite_bytes bigint,
                plano text CHECK('free','pro','empresa'),
                percentual_usado numeric, created_at, updated_at)
logs_upload    (id uuid PK, obra_id bigint, arquivo_nome text,
                arquivo_tamanho bigint, bucket text,
                status text CHECK('sucesso','falha'),
                erro_mensagem text, user_id uuid, created_at)

-- Versionamento
versoes (id bigint PK, obra_id bigint FK, nome text, descricao text,
         status text CHECK('Definitiva','Em Atualização'),
         snapshot jsonb)  -- { pavimentos: [...] } cópia completa e imutável
```

---

## Como executar

### Pré-requisitos
- Node.js 20+
- Projeto Supabase criado (free tier funciona)

### Instalação

```bash
git clone <repositório>
cd plansaas
npm install
```

### Variáveis de ambiente

Criar `.env.local` na raiz:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

> As mesmas variáveis devem ser configuradas no painel Vercel → Settings → Environment Variables.

### Desenvolvimento

```bash
npm run dev      # http://localhost:3000 (Turbopack)
npm run build    # build de produção + verificação TypeScript
npm run lint     # ESLint
npm test         # Vitest — 17 testes unitários (calculador-avanco)
```

### Migrações

O schema é aplicado manualmente no **Supabase Dashboard → SQL Editor**. Não usa Prisma nem migrations automáticas. O schema completo está documentado acima.

SQL necessário para RPC de storage (executar uma vez):

```sql
CREATE OR REPLACE FUNCTION incrementar_storage(p_empresa_id uuid, p_bytes bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE storage_quotas
  SET storage_usado_bytes = GREATEST(0, storage_usado_bytes + p_bytes),
      updated_at = now()
  WHERE empresa_id = p_empresa_id;
END;
$$;
```

---

## Próximos passos

### Curto prazo (infraestrutura)
- [ ] Confirmar que `incrementar_storage` RPC está criado no Supabase (ver SQL acima)
- [ ] Rate limiting no endpoint de upload (`/api/medicoes/upload`)
- [ ] Mover queries diretas do browser Supabase para API routes (defesa em profundidade)
- [ ] Testes Vitest para `upload-helper.ts` e validações de `schemas.ts`

### Médio prazo (features)
- [ ] **React Query Fase 2** — migrar `apontamentos/page.tsx` fetch de atividades/atrasadas para hooks
- [ ] **React Query Fase 3** — migrar `useDashboardData.ts` para React Query (alto risco, planejar separado)
- [ ] **PWA** — `next-pwa` + `persistQueryClient` + IndexedDB para offline-ready
- [ ] **Notificações push** — alertas de atividades atrasadas ou PARALISADAS
- [ ] **Export CSV/PDF** do dashboard (ModalRelatorio já existe, falta implementar geração)
- [ ] **Apontamento por token** — acesso mobile sem login para encarregados (TokenApontamento já está no schema)

### Longo prazo (produto)
- [ ] **Planos pagos** — upgrade de quota (pro/empresa), integração Stripe
- [ ] **App nativo** (React Native / Expo) usando a mesma API
- [ ] **Relatório PDF automático** enviado por email semanalmente
- [ ] **Integração com MS Project / Primavera** — importação de cronograma
