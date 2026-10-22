# Sistema de planta e processos da Paiol na Vercel

O sistema fica em dois repositórios privados do GitHub e é publicado pela Vercel.

- **paiol-sistema:** a página (index.html) e a função que salva os dados (api/estado.js). É este repositório que a Vercel publica.
- **paiol-dados:** só o arquivo estado.json, com a planta, os setores e os processos. Cada salvamento no sistema vira um commit aqui, e o histórico do GitHub guarda todas as versões.

## Variáveis de ambiente na Vercel

| Nome | O que colocar |
|---|---|
| SENHA | A senha que a pessoa vai digitar para entrar no sistema. Use uma frase longa. |
| GITHUB_TOKEN | O token do GitHub com permissão Contents (leitura e escrita) só no repositório paiol-dados. |
| GITHUB_REPO | O nome do repositório de dados no formato usuario/paiol-dados. |
| GITHUB_ARQUIVO | Opcional. Padrão: estado.json. |
| GITHUB_BRANCH | Opcional. Padrão: main. |

Mudança em variável só vale para a próxima publicação. Depois de trocar a senha ou o token, abra o projeto na Vercel, vá em Deployments e use Redeploy na publicação mais recente.

## Como funciona

1. A página abre pedindo a senha. Sem a senha certa, nenhum dado da loja aparece.
2. Com a senha, a página busca o estado.json no repositório paiol-dados, pela função da Vercel. O token do GitHub fica só na Vercel e nunca chega ao navegador.
3. Cada alteração é salva sozinha poucos segundos depois. O botão Salvar grava na hora.
4. Se os dados tiverem mudado em outro lugar depois que a página abriu, o sistema não sobrescreve: avisa, guarda as mudanças no navegador e oferece carregar a versão nova e reaplicar.
5. O Exportar gera o manual em Word e a imagem da planta no próprio navegador.

## Para voltar uma versão antiga

No GitHub, abra o repositório paiol-dados, clique no arquivo estado.json e depois em History. Abra a versão desejada, copie o conteúdo, edite o estado.json atual, cole e confirme o commit. Feche e abra o sistema de novo.
