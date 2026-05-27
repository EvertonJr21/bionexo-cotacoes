# Bionexo · Análise de Cotações

Sistema de análise e histórico de cotações mensais do Bionexo.

## Funcionalidades

- Importação do JSON exportado do Bionexo (Relatório Analítico)
- Dashboard com resumo do pedido e gráficos
- Análise mensal com identificação dos itens para negociar
- Histórico de preços por produto (mês a mês)
- Detecção automática de itens novos, removidos e com preço alterado entre meses

## Stack

- HTML + CSS + JavaScript puro (sem framework)
- Supabase (banco PostgreSQL)
- Hospedagem via Vercel

## Como usar

1. Acesse o sistema no navegador
2. Vá em **Importar JSON**
3. Arraste o arquivo exportado do Bionexo (Informações Gerenciais → Relatório Analítico)
4. Confirme a importação
5. Navegue pelo **Dashboard** e **Análise Mensal**

## Deploy

Conecte este repositório ao Vercel. Nenhuma variável de ambiente necessária — as credenciais do Supabase estão em `app.js`.
