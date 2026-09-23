# Execucao como servico do Windows

O projeto inclui um script PowerShell que instala o client como um servico do Windows usando o [WinSW](https://github.com/winsw/winsw). O servico inicia automaticamente com o Windows, reinicia o processo quando ele falha e grava logs rotativos em `.windows-service/logs`.

## Pre-requisitos

- Windows de 64 bits;
- Node.js e npm disponiveis no `PATH`;
- `.env` criado e configurado a partir de `.env.example`;
- PowerShell executado com uma conta que possa autorizar a solicitacao de administrador.

O servico usa a conta `LocalSystem`. Portanto, `STORAGE_PATH` e o arquivo SQLite indicado por `DATABASE_URL` precisam ser caminhos locais acessiveis por essa conta. Unidades de rede mapeadas para o usuario interativo normalmente nao ficam disponiveis para servicos; nesse caso, use um caminho UNC e configure uma conta de servico com as permissoes apropriadas no painel de Servicos do Windows.

## Instalar

Abra o PowerShell no diretorio do projeto e execute:

```powershell
Copy-Item .env.example .env
# Edite o .env antes de continuar.
npm run service:install
```

Durante a instalacao, o script:

1. instala exatamente as dependencias do `package-lock.json`;
2. gera o Prisma Client e aplica as migracoes pendentes;
3. compila o TypeScript;
4. baixa o WinSW 2.12.0 e confere seu SHA-256;
5. registra e inicia o servico `InfotecStorageClient`.

Para uma instalacao a partir de um artefato ja preparado, sem executar os tres primeiros passos:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\service.ps1 Install -SkipPrepare
```

## Operar e remover

```powershell
npm run service:status
npm run service:restart
npm run service:update
npm run service:stop
npm run service:start
npm run service:uninstall
```

A remocao preserva os arquivos do wrapper e os logs em `.windows-service`. Esse diretorio e local e esta ignorado pelo Git.

Depois de alterar codigo, dependencias ou migracoes, execute `npm run service:update`. O comando para o servico, prepara novamente a aplicacao e a inicia somente se toda a preparacao concluir com sucesso. Alteracoes somente no `.env` exigem apenas `npm run service:restart`.
