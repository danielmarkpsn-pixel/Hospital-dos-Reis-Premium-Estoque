# Hospital dos Reis Premium — Controle de Estoque v2.0

Aplicativo desktop Windows com interface preto/grafite para materiais cirúrgicos, lotes, validade, movimentações, consumo por cirurgia e usuários com permissões.

## Recursos da versão 2.0
- Painel executivo com estoque crítico, vencimentos, consumo mensal e valor estimado por custo unitário.
- Leitura de código de barras por scanner USB ou digitação; o código pode ser associado ao cadastro do material.
- Cadastro de fornecedores com CNPJ, contatos, endereço e associação aos materiais.
- Auditoria das operações autenticadas, com usuário, horário, módulo, método e origem; valores de senha e tokens não são armazenados no log.
- Relatórios avançados com filtros por período, material, usuário e tipo de movimentação.
- Backup automático na inicialização e a cada 24 horas, retenção de até 14 cópias e download manual.
- Alteração da senha pelo usuário autenticado e chave de sessão JWT gerada localmente e persistida no diretório de dados.

## Recursos herdados da versão 1.0
- Painel de estoque baixo, lotes vencidos e próximos do vencimento.
- Cadastro e edição de materiais.
- Entradas, saídas, perdas e ajustes de estoque.
- Registro de cirurgias por código interno e consumo de materiais.
- Histórico de movimentações e exportação do saldo para CSV.
- Perfis: administrador, equipe de estoque e somente consulta.
- Banco de dados SQLite e senha armazenada com hash.
- Acesso pela rede local: um computador hospeda o serviço; os demais acessam pelo navegador.

## Primeiro acesso
- Usuário: `admin`
- Senha inicial em bancos novos: `admin`

**Altere a senha inicial imediatamente** na tela Segurança e backup. Bancos já existentes mantêm as senhas atuais.

## Como publicar no GitHub pelo navegador
1. Crie um repositório no GitHub, por exemplo `Hospital-dos-Reis-Premium-Estoque`.
2. Extraia este ZIP no computador, se possível, ou use **Add file → Upload files** com os arquivos descompactados.
3. Envie todos os arquivos e pastas mantendo a estrutura.
4. O workflow em `.github/workflows/build-windows.yml` compila o instalador e publica o artefato na execução do GitHub Actions.

## Como obter o instalador
1. Abra o repositório no GitHub e clique em **Actions**.
2. Se necessário, habilite Actions.
3. Abra a execução mais recente do workflow **Build Windows**.
4. Baixe o artefato `Hospital-dos-Reis-Premium-Estoque-Windows`.

## Rede local — importante
- Instale e execute o programa em **um computador servidor**. Esse computador mantém o banco de dados e deve ficar ligado.
- Nos computadores clientes, acesse `http://IP-DO-SERVIDOR:4317` no navegador. A tela **Rede local** mostra o endereço detectado.
- Autorize o aplicativo/porta TCP 4317 no firewall somente para a rede privada da clínica.
- O IP do servidor deve ser reservado no roteador.
- Não publique a porta na internet. A V2.0 inclui auditoria de operações e backups automáticos, mas ainda não implementa HTTPS, MFA ou restauração guiada. Use apenas após validar segurança, integridade e recuperação dos dados.

## Build local opcional
Requer Node.js LTS instalado:
```bash
npm install
npm start
```
O build do instalador:
```bash
npm run dist
```

## Limitações importantes da versão 2.0
- A restauração guiada pela interface ainda não está habilitada; faça a recuperação com o serviço interrompido e valide a cópia antes de reabrir o sistema.
- O CSV de estoque exporta o saldo atual. O relatório de movimentações permite imprimir/salvar em PDF pelo navegador.
- A baixa por consumo usa lotes com validade mais próxima quando não se escolhe lote. A equipe deve conferir o lote físico antes de confirmar.
- O sistema não substitui procedimentos de qualidade, conferência de lote, rastreabilidade regulatória, controles de esterilidade ou registros clínicos. Não registre nome, CPF, prontuário ou outros dados identificáveis de pacientes nesta versão.
- Faça testes de segurança, integridade, restauração e operação antes de usar em ambiente assistencial real.
