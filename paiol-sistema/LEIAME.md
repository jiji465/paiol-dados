# Sistema de planta e processos da Paiol na Vercel

O sistema fica no repositório privado paiol-dados do GitHub, em duas pastas, e é publicado pela Vercel.

- **paiol-sistema:** a página (index.html) e a função que salva os dados (api/estado.js). É esta pasta que a Vercel publica (Root Directory = paiol-sistema).
- **paiol-dados:** o arquivo estado.json, com a planta, os setores e os processos, e a pasta fotos, com as fotos tiradas pelo sistema. Cada salvamento vira um commit, e o histórico do GitHub guarda todas as versões.

## Variáveis de ambiente na Vercel

| Nome | O que colocar |
|---|---|
| SENHA | A senha de quem edita. Use uma frase longa. |
| SENHA_CONSULTA | Opcional. A senha de quem só consulta: vê a planta, os processos e as fotos, mas não muda nada. |
| GITHUB_TOKEN | O token do GitHub com permissão Contents (leitura e escrita) no repositório paiol-dados. |
| GITHUB_REPO | jiji465/paiol-dados |
| GITHUB_ARQUIVO | paiol-dados/estado.json |
| GITHUB_BRANCH | Opcional. Padrão: main. |

Mudança em variável só vale para a próxima publicação. Depois de cadastrar ou trocar uma variável, abra o projeto na Vercel, vá em Deployments e use Redeploy na publicação mais recente.

## Como funciona

1. A página abre pedindo a senha. Sem a senha certa, nenhum dado da loja aparece. Cada senha errada demora para responder e, depois de 8 erros do mesmo endereço em 15 minutos, a entrada desse endereço fica bloqueada por 15 minutos (o bloqueio fica na memória da função e recomeça quando a Vercel a reinicia).
2. Com a senha, a página busca o estado.json pela função da Vercel. O token do GitHub fica só na Vercel e nunca chega ao navegador.
3. Cada alteração é salva sozinha poucos segundos depois. O botão Salvar grava na hora.
4. Se os dados tiverem mudado em outro lugar depois que a página abriu, o sistema não sobrescreve: avisa, guarda as mudanças no navegador e oferece carregar a versão nova e reaplicar.
5. O botão Versões lista os salvamentos anteriores; dá para ver o resumo de cada um e trazê-lo de volta. Restaurar vira um salvamento novo, e nada se perde.
6. As fotos são reduzidas no próprio navegador antes de subir e ficam na pasta fotos, ao lado do estado.json.
7. O Exportar gera o manual em Word e a imagem da planta. O POP de cada processo sai pelo botão Imprimir o POP, na tela do processo.

## Para atualizar o sistema

Troque só os arquivos da pasta paiol-sistema. Não envie de novo o estado.json: ele guarda o que foi editado online e seria sobrescrito.
