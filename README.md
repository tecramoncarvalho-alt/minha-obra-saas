# Minha Obra

SaaS multi-tenant de gestão de obras com Linha de Balanço, apontamentos diários de efetivo e monitoramento de produtividade em tempo real.

---

## Sobre o Projeto

**Minha Obra** é uma plataforma web para gestão de obras civis, focada na metodologia de **Linha de Balanço** — um modelo de planeamento de produção que representa visualmente o ritmo de execução de cada atividade por pavimento ao longo do tempo.

O sistema permite que equipas de engenharia:
- Planeiem obras com blocos, pavimentos e atividades interligadas
- Visualizem o fluxo de trabalho em gráfico interativo com drag-and-drop
- Registem diariamente o **efetivo real** e o **avanço físico** por atividade
- Comparem o **planeado vs. real** via KPIs, Curva S e alertas automáticos
- Exportem relatórios por dia, semana ou mês em CSV/PDF

---

## Stack Tecnológico

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.4 |
| UI | React + TypeScript | 19 / 5 |
| Styling | Tailwind CSS (sem shadcn/ui) | 4 |
| Base de Dados | Supabase (PostgreSQL) | — |
| Autenticação | Supabase Auth SSR | 0.10.2 |
| Storage | Supabase Storage | — |
| Gráficos | Recharts | 3.8.1 |
| Testes | Vitest | 4.1.5 |
| Deploy | Vercel (branch `main`) | — |

---

## Arquitetura

```
plansaas/
├── proxy.ts                          # Middleware de autenticação (NÃO é middleware.ts)
├── app/
│   ├── layout.tsx                    # RootLayout com <AuthProvider>
│   ├── providers.tsx                 # AuthContext: user, empresa, role, signOut, loading
│   ├── calendario.ts                 # FONTE DE VERDADE para cálculos de dias úteis
│   ├── page.tsx                      # Home: lista e criação de obras
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── setup/page.tsx                # Primeiro acesso: criar empresa
│   ├── auth/callback/route.ts        # Callback PKCE e OTP
│   ├── api/
│   │   ├── invite/route.ts                           # POST: convite de membro (service role)
│   │   ├── empresa/[id]/storage-quota/route.ts       # GET: quota de storage por empresa
│   │   ├── medicoes/upload/route.ts                  # POST: upload de foto de medição
│   │   └── obras/[id]/
│   │       ├── apontamentos/route.ts                 # GET + POST: apontamentos diários
│   │       └── apontamentos/[apontamentoId]/route.ts # PUT + DELETE: editar/apagar
│   ├── configuracoes/equipe/page.tsx # Gestão de membros (admin only)
│   ├── lib/
│   │   ├── types.ts                  # Interfaces centralizadas (Obra, Atividade, ApontamentoDiario, …)
│   │   ├── calculador-avanco.ts      # Funções puras: desvio, Curva S, delta efetivo
│   │   └── apontamentos.ts           # Helpers de BD para apontamentos
│   └── obras/[id]/
│       ├── page.tsx                  # Config da obra: pavimentos, feriados, foto
│       ├── linha-balanco/
│       │   ├── page.tsx              # Orquestrador (~1370 linhas)
│       │   ├── utils/                # geradorCores.ts, helpers.ts
│       │   ├── hooks/                # useCalendarioAtividades, useAtividades,
│       │   │                         # useVinculos, useDragAndDrop, useConflitos
│       │   └── components/           # GraficoLinhaBalanco, BarraAtividade,
│       │       └── modais/           # CalendarioHeader, ToolbarSuperior, …
│       ├── dashboard/
│       │   ├── page.tsx              # Dashboard principal
│       │   └── components/
│       │       ├── KpiCards.tsx         # % conclusão, desvio, aderência, críticas
│       │       ├── AlertasParalisadas.tsx
│       │       ├── GridEfetivo.tsx      # Previsto vs real com barras duplas
│       │       ├── CurvaS.tsx           # AreaChart planejado + linha real
│       │       ├── RowHighlight.tsx     # Linha reutilizável para TabelaAtencao
│       │       └── TabelaAtencao.tsx    # Atividades em atenção + drawer histórico
│       ├── apontamentos/page.tsx     # Formulário de apontamento diário
│       ├── criacao-em-lote/page.tsx  # Wizard de criação de blocos/pavimentos
│       └── editar-bloco/[bloco]/page.tsx
├── components/
│   └── Header.tsx                    # Header global
├── lib/supabase/client.ts            # Singleton browser client
├── __tests__/
│   └── calculadorAvanco.test.ts      # 17 testes Vitest
└── vitest.config.ts
```

### Fluxo de Autenticação

1. `proxy.ts` intercepta todas as requisições
2. Não autenticado → `/login`; rotas públicas: `/login`, `/signup`, `/auth/callback`
3. Autenticado sem empresa → `/setup`
4. `AuthProvider` em `providers.tsx` expõe `useAuth()` globalmente

### Clientes Supabase

| Contexto | Módulo | Padrão |
|---|---|---|
| Browser (páginas) | `lib/supabase/client.ts` | Singleton `createBrowserClient` |
| Server (proxy, callbacks) | inline | `createServerClient` com cookies |
| Admin (API routes) | inline | Instância separada com service role |

---

## Schema da Base de Dados

```sql
-- Multi-tenancy
empresas          (id uuid PK, nome text, created_at)
usuarios_empresas (user_id uuid FK, empresa_id uuid FK,
                   role text CHECK('admin','editor','viewer'),
                   UNIQUE(user_id, empresa_id))

-- Obras e Calendário
obras      (id bigint PK, empresa_id uuid FK,
            nome text, descricao text, foto_url text,
            data_inicio date, data_fim date,
            sabado_util bool DEFAULT false,
            domingo_util bool DEFAULT false)

feriados   (id bigint PK, obra_id bigint FK,
            data text 'YYYY-MM-DD', nome text)

-- Estrutura
pavimentos (id bigint PK, obra_id bigint FK,
            nome text,        -- "NomeBloco - NomePavimento"
            numero int,       -- ordem visual
            observacao text)  -- metadados de bloco no 1º pavimento

-- Planeamento
atividades  (id bigint PK, pavimento_id bigint FK,
             nome text, data_inicio date, data_fim date,
             duracao_dias int,   -- DIAS ÚTEIS
             equipe text, efetivo int,
             linha_index int,    -- linha visual (múltiplas por pavimento)
             vinculo_id text,    -- UUID da cadeia de dependência
             vinculo_ordem int)  -- posição na cadeia

subatividades (id bigint PK, atividade_id bigint FK,
               nome text, duracao int, equipe text, efetivo int, ordem int)

-- Registo Real (Apontamentos)
apontamentos_diarios (id uuid PK, atividade_id bigint FK,
                      data text 'YYYY-MM-DD',
                      efetivo_real int,
                      percentual_executado int,  -- 0-100
                      status text CHECK('NAO_INICIADA','INICIADA','EM_ANDAMENTO',
                                        'CONCLUIDA_NO_DIA','PARALISADA')
                                   DEFAULT 'EM_ANDAMENTO',
                      observacao text, responsavel text,
                      created_by uuid FK, created_at, updated_at)

-- Medições com Fotos
medicoes (id uuid PK, atividade_id bigint FK, apontamento_id uuid FK,
          data_medicao text, quantidade_executada numeric,
          unidade text, responsavel text, foto_url text,
          observacao text, created_by uuid FK, created_at)

-- Storage
storage_quotas (id uuid PK, empresa_id uuid FK,
                storage_usado_bytes bigint, storage_limite_bytes bigint,
                plano text CHECK('free','pro','empresa'),
                percentual_usado numeric)

logs_upload (id uuid PK, obra_id bigint, arquivo_nome text,
             arquivo_tamanho bigint, bucket text,
             status text CHECK('sucesso','falha'),
             erro_mensagem text, user_id uuid, created_at)

-- Versionamento
versoes (id bigint PK, obra_id bigint FK,
         nome text, descricao text,
         status text CHECK('Definitiva','Em Atualização'),
         snapshot jsonb)  -- { pavimentos: [...] } cópia completa
```

---

## Funcionalidades Principais

### Linha de Balanço
- Gráfico interativo com arrastar e largar atividades
- Zoom por intervalo de datas + filtro por pavimento/bloco
- Vínculos de dependência entre atividades (cadeia propagada no drag)
- Subatividades por equipe com cores distintas
- Linha "Hoje" em vermelho + tooltips ao hover
- Tela cheia + impressão/PDF
- **Toggle "Avanço Real"**: sobrepõe dois segmentos visuais em cada barra (parte executada clareada; parte paralisada com hachura diagonal)
- Versionamento com snapshots (Definitiva = read-only)

### Dashboard de Produtividade
- **KPI cards**: % conclusão geral, desvio em dias úteis, aderência de efetivo, atividades críticas
- **Alertas** de atividades PARALISADAS em destaque vermelho
- **Grid efetivo** previsto vs. real com delta colorido e barras de progresso duplas
- **Curva S** — gráfico de avanço acumulado planeado vs. real em dias úteis
- **Tabela "Atividades em Atenção"** — filtra automaticamente atividades com desvio > 10%, prazo vencido ou PARALISADAS; drawer lateral com histórico completo
- Relatórios exportáveis: Excel (CSV) e PDF impresso, por dia/semana/mês

### Apontamentos Diários
- Registo por atividade: efetivo real, % executado, observação, responsável
- Seletor de status com lógica automática:
  - `PARALISADA` → efetivo zerado, progresso preservado
  - `CONCLUIDA_NO_DIA` → força 100%
- Validação de regressão de progresso (confirmação obrigatória)
- Upload de fotos de medição (JPEG/PNG/WebP, máx 1MB)
- Historial dos últimos 7 dias

### Gestão de Obras
- CRUD de obras com foto de capa
- Configuração de calendário por obra (sábado/domingo úteis + feriados personalizados)
- Wizard de criação em lote de blocos e pavimentos
- RBAC: admin / editor / viewer com convites por email

---

## Como Executar

### Pré-requisitos
- Node.js 20+
- Conta Supabase com projeto criado

### Instalação

```bash
git clone <repositório>
cd plansaas
npm install
```

### Variáveis de Ambiente

Criar `.env.local` na raiz:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # apenas para API routes de admin
```

### Migrações da Base de Dados

As migrações são executadas manualmente no **Supabase Dashboard → SQL Editor** (não usa Prisma). O schema completo está documentado acima.

Para adicionar o sistema de apontamentos a um projeto existente:

```sql
-- Coluna status nos apontamentos
ALTER TABLE apontamentos_diarios
  ADD COLUMN IF NOT EXISTS status TEXT
    CHECK (status IN ('NAO_INICIADA','INICIADA','EM_ANDAMENTO','CONCLUIDA_NO_DIA','PARALISADA'))
    DEFAULT 'EM_ANDAMENTO';

CREATE INDEX IF NOT EXISTS idx_apontamentos_status
  ON apontamentos_diarios (status);
```

### Desenvolvimento

```bash
npm run dev    # http://localhost:3000 (Next.js + Turbopack)
npm run build  # build de produção
npm run lint   # ESLint
npm test       # Vitest (17 testes unitários)
```

---

## Contexto de Negócio

| Termo | Definição |
|---|---|
| **Linha de Balanço** | Método de planeamento onde cada atividade é representada como uma linha inclinada num gráfico pavimento × tempo. O ritmo de produção (inclinação) deve ser constante e sem cruzamentos entre atividades. |
| **Efetivo** | Número de trabalhadores alocados a uma atividade. O "efetivo previsto" vem do planeamento; o "efetivo real" é registado diariamente no apontamento. |
| **Avanço Físico** | Percentagem de execução de uma atividade (0–100%). Registado no apontamento diário. |
| **Apontamento** | Registo diário do estado real de uma atividade: efetivo real, % executado, status e observações. |
| **Desvio de Prazo** | Diferença entre o avanço % previsto pelo planeamento e o avanço % real, convertido em dias úteis. Negativo = atraso. |
| **Curva S** | Gráfico acumulado de avanço físico ao longo do tempo. A curva planeada tem forma de "S"; a curva real deve aproximar-se dela. |
| **Dias Úteis** | O sistema opera exclusivamente em dias úteis configuráveis por obra (fins de semana e feriados são opcionais). |
| **Aderência de Efetivo** | Rácio entre o efetivo real total e o efetivo previsto total, expresso em %. Abaixo de 80% é considerado crítico. |
| **PARALISADA** | Status de atividade que indica interrupção: efetivo vai a zero mas o progresso é preservado. Gera alerta no dashboard. |
