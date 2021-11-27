// mobile menu functionality
const navbarBurger = document.querySelector('#navigation-burger');
const navbarMenu = document.querySelector('#navigation-links');

navbarBurger.addEventListener('click', () => {
    navbarMenu.classList.toggle('is-active');
    console.log('I did it')
});