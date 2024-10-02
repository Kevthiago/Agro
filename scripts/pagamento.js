class Pagamento {
    constructor() {
        this.pagamentoSelect = document.getElementById('lista-pagamento');
        this.cartaoDetalhes = document.getElementById('cartao-detalhes');
        this.boletoDetalhes = document.getElementById('boleto-detalhes');
        this.pixDetalhes = document.getElementById('pix-detalhes');

        this.pagamentoSelect.addEventListener('change', this.mudarFormaPagamento.bind(this));
    }

    mudarFormaPagamento() {
        // Oculta todas as divs de detalhes de pagamento
        this.cartaoDetalhes.style.display = 'none';
        this.boletoDetalhes.style.display = 'none';
        this.pixDetalhes.style.display = 'none';

        // Mostra a div correspondente à escolha do usuário
        const valorSelecionado = this.pagamentoSelect.value;
        if (valorSelecionado === 'cartao_credito' || valorSelecionado === 'cartao_debito') {
            this.cartaoDetalhes.style.display = 'block';
        } else if (valorSelecionado === 'boleto') {
            this.boletoDetalhes.style.display = 'block';
        } else if (valorSelecionado === 'pix') {
            this.pixDetalhes.style.display = 'block';
        }
    }
}

const pagamento = new Pagamento();