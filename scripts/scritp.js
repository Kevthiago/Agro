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
