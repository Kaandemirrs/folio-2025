// İletişim bilgisi tek yerde. E-posta ikonları (ileride), konsol mesajı ve Ana Sayfa bunu kullanır.
export default {
    email: 'kaandmr4331@hotmail.com',
    subject: 'Portfolyo üzerinden iletişim',
    get mailto() { return `mailto:${this.email}?subject=${encodeURIComponent(this.subject)}` },
}
