// migrace se do Workeru přibalí jako text (wrangler: *.sql = Text) – pro tabulky dalších uživatelů
declare module "*.sql" {
  const sql: string;
  export default sql;
}
