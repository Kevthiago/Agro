class Burguer {
    constructor() {
        this.itens = document.getElementById('itens');
    }

    mudouTamanho() {
        if (window.innerWidth <= 768) {
            this.itens.style.display = 'none';
        } else {
            this.itens.style.display = 'block';
        }
    }

    clickMenu() {
        if (this.itens.style.display === 'block') {
            this.itens.style.display = 'none';
        } else {
            this.itens.style.display = 'block';
        }
    }
}

const menuBurguer = new Burguer();

// Adicionar um evento de clique ao ícone do hambúrguer usando JavaScript
document.getElementById('burguer').addEventListener('click', () => menuBurguer.clickMenu());

// Adicionar evento de redimensionamento e carregamento da página
window.onresize = () => menuBurguer.mudouTamanho();
window.onload = () => menuBurguer.mudouTamanho();


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

