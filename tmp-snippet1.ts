const address:{port:number} = {port:3000};
const loginBody:any = {data:{tokens:{accessToken:"abc"}}};
async function foo() {
      data: { tokens: { accessToken: string } };
    };

    const response = await fetch(
      `http://127.0.0.1:${address.port}/users?page=1&pageSize=2`,
      {
        headers: {
        Authorization: `Bearer ${loginBody.data.tokens.accessToken}`,
      },
    );

}
