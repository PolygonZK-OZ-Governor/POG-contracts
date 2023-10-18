# POG-contracts
The smart contract system of the PolygonZKEVM Openzeppelin-based governor

tai vi trong example chung no xai chung 1 bridge o mainnet, o phan nay em thu viet 2 cai cau o 2 networkID khac nhau va chay thu thi 
loi nam o phan verify, em nghi la brighe thi chung phai tu dong update (relayer), tuc la khi minh hoat dong
khi minh bridge message thi mainnetRoot cua chain do se duoc update
khi minh su dung update RollUp thi RollupRoot cua chain do se duoc update
tuy nhien khi minh su dung claimMessage o testnet thi se su dung mainnetRoot cua testnet de verify chu k phai RollUp. em dang nghi co the la cau 1 chieu :v

kiểu để claim được 1 message thì 
destinationNetWork phải = với netWorkID của cầu

mà networkID của cầu = mainnet thì nó sẽ lấy root là rollup còn k nó sẽ lấy là mainnet
tuy nhiên mainnet chỉ có thể cập nhật qua smartContract Bridge khi mình bridgeMessge 
còn RollUp có thể cập nhật qua tài khoản tạo cầu

