'use client';

import { useState, useEffect } from 'react';
import { createWalletClient, createPublicClient, custom, http, parseEther, formatEther } from 'viem';
import { base } from 'viem/chains';

declare global {
  interface Window {
    ethereum?: any;
  }
}

// 本番BaseメインネットのProxyアドレス（看板）
const CONTRACT_ADDRESS = '0xD522C53E7E85FEB7a485b140d637cBa63B70d804';

const CONTRACT_ABI = [
  {
    type: 'function',
    name: 'supportCreator',
    inputs: [{ name: 'creator', type: 'address' }],
    outputs: [],
    stateMutability: 'payable',
  },
] as const;

// Baseメインネットの公開RPCクライアント
const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

interface ActivityLog {
  id: string;
  type: 'SIGNATURE' | 'TRANSFER';
  detail: string;
  timestamp: string;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);

  const [account, setAccount] = useState<string>('');
  const [balance, setBalance] = useState<string>('0');
  const [blockNumber, setBlockNumber] = useState<string>('0');
  
  const [totalSupported, setTotalSupported] = useState<number>(0);
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  const [chapterId, setChapterId] = useState<number>(1);
  const [ipfsCid, setIpfsCid] = useState<string>('QmZ4tDuvesekSs4qM5ZBKpXiZGun7S2CYtEZRB3DYXkjGx');
  const [signature, setSignature] = useState<string>('');
  const [supportAmount, setSupportAmount] = useState<string>('0.001');
  const [txHash, setTxHash] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    setMounted(true);
  }, []);

  // ウォレット側のアカウント切り替えをリアルタイム検知
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          setStatus(`ウォレット切替: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);
        } else {
          setAccount('');
          setBalance('0');
          setStatus('ウォレットが切断されました');
        }
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        }
      };
    }
  }, []);

  // Baseメインネットのオンチェーンデータ取得
  const fetchChainData = async () => {
    try {
      const block = await publicClient.getBlockNumber();
      setBlockNumber(block.toString());

      if (account) {
        const bal = await publicClient.getBalance({ address: account as `0x${string}` });
        setBalance(Number(formatEther(bal)).toFixed(4));
      }
    } catch {
      // ネットワークエラー時はスキップ
    }
  };

  useEffect(() => {
    if (!mounted) return;
    fetchChainData();
    const interval = setInterval(fetchChainData, 3000);
    return () => clearInterval(interval);
  }, [mounted, account]);

  const connectWallet = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('ウォレットをブラウザにインストールしてください');
      return;
    }
    try {
      await window.ethereum.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      });
      
      // 接続時にBaseネットワークへの切り替えを要求
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x2105' }], // 8453(Base)の16進数
        });
      } catch (e) {
        console.log(e);
      }

      const client = createWalletClient({
        chain: base,
        transport: custom(window.ethereum),
      });
      const [address] = await client.requestAddresses();
      setAccount(address);
      setStatus('Baseメインネットに接続しました');
    } catch (err: any) {
      setStatus(`接続拒否: ${err.message}`);
    }
  };

  const signGaslessUpdate = async () => {
    if (!account) return alert('先にウォレットを接続してください');
    try {
      // 署名前にBaseチェーンへの強制切り替え命令
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x2105' }],
        });
      } catch (e) {
        console.log("Switch chain error:", e);
      }
      
      setStatus('署名待機中...');
      const client = createWalletClient({
        chain: base,
        transport: custom(window.ethereum),
      });

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      const sig = await client.signTypedData({
        account: account as `0x${string}`,
        domain: {
          name: 'DynamicKnowledgeBook',
          version: '1',
          chainId: BigInt(8453), // Base Mainnet
          verifyingContract: CONTRACT_ADDRESS,
        },
        types: {
          ChapterUpdate: [
            { name: 'chapterId', type: 'uint256' },
            { name: 'ipfsCid', type: 'string' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'ChapterUpdate',
        message: {
          chapterId: BigInt(chapterId),
          ipfsCid: ipfsCid,
          nonce: BigInt(0),
          deadline: deadline,
        },
      });

      setSignature(sig);
      setStatus('EIP-712暗号署名を生成しました（ガス代: 0 ETH）');

      setActivities((prev) => [
        {
          id: Math.random().toString(),
          type: 'SIGNATURE',
          detail: `第 ${chapterId} 章の耐検閲改変署名を発行 (CID: ${ipfsCid.slice(0, 8)}...)`,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } catch (err: any) {
      setStatus(`署名失敗: ${err.message}`);
    }
  };

  const handleSupport = async () => {
    if (!account) return alert('先にウォレットを接続してください');
    try {
      // 送金前にBaseチェーンへの強制切り替え命令
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x2105' }],
        });
      } catch (e) {
         console.log("Switch chain error:", e);
      }

      setStatus('クリエイターへ即時P2P送金中...');
      const client = createWalletClient({
        chain: base,
        transport: custom(window.ethereum),
      });

      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'supportCreator',
        args: [account as `0x${string}`],
        value: parseEther(supportAmount),
        account: account as `0x${string}`,
      });

      setTxHash(hash);
      const amountNum = parseFloat(supportAmount);
      setTotalSupported((prev) => prev + amountNum);
      setStatus('送金完了：中間マージン0%でクリエイターに着金');

      setActivities((prev) => [
        {
          id: hash,
          type: 'TRANSFER',
          detail: `${supportAmount} ETH をダイレクト送金 (中抜き排除)`,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } catch (err: any) {
      setStatus(`送金失敗: ${err.message}`);
    }
  };

  const savedMiddlemanFeeEth = (totalSupported * 0.15).toFixed(4);

  if (!mounted) {
    return (
      <main className="min-h-screen bg-black text-neutral-500 flex items-center justify-center font-mono text-xs">
        INITIALIZING PROTOCOL...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-12 md:px-16 max-w-5xl mx-auto selection:bg-white selection:text-black">
      
      {/* ヘッダー */}
      <header className="flex justify-between items-baseline border-b border-neutral-800 pb-8 mb-10">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">
            DYNAMIC KNOWLEDGE BOOK
          </h1>
          <p className="text-xs text-neutral-500 mt-1 uppercase tracking-widest">
            Open-Ledger Protocol Dashboard (Base Mainnet)
          </p>
        </div>

        <div>
          {account ? (
            <div className="text-right">
              <button
                onClick={connectWallet}
                title="クリックして別のアカウントに切り替え"
                className="text-xs font-mono border border-neutral-700 hover:border-white px-3 py-1.5 text-neutral-300 transition"
              >
                {account.slice(0, 6)}...{account.slice(-4)} (切替)
              </button>
              <span className="text-[10px] font-mono text-neutral-500 block mt-1">
                BAL: {balance} ETH
              </span>
            </div>
          ) : (
            <button
              onClick={connectWallet}
              className="text-xs font-bold border border-white bg-white text-black px-4 py-2 hover:bg-neutral-200 transition"
            >
              ウォレットを接続
            </button>
          )}
        </div>
      </header>

      {/* リアルタイム非中央集権ダッシュボード */}
      <section className="mb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-neutral-800 border border-neutral-800">
          
          <div className="bg-black p-6">
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest block font-mono">
              DIRECT VALUE FLOWED
            </span>
            <div className="text-2xl font-bold tracking-tight mt-2">
              {totalSupported.toFixed(3)} <span className="text-xs font-normal text-neutral-400">ETH</span>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              クリエイター直結の純粋流通額
            </p>
          </div>

          <div className="bg-black p-6">
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest block font-mono">
              MIDDLEMAN FEES PREVENTED
            </span>
            <div className="text-2xl font-bold tracking-tight mt-2">
              {savedMiddlemanFeeEth} <span className="text-xs font-normal text-neutral-400">ETH</span>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              既存胴元（15%）から防衛した金額
            </p>
          </div>

          <div className="bg-black p-6">
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest block font-mono">
              BASE ON-CHAIN STATUS
            </span>
            <div className="text-2xl font-bold font-mono tracking-tight mt-2">
              #{blockNumber}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              Baseメインネット (8453) リアルタイム同期
            </p>
          </div>

        </div>
      </section>

      {/* メインアクションエリア */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">

        {/* コア①：記事改変（ガス代0署名） */}
        <div className="border border-neutral-800 p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-baseline border-b border-neutral-900 pb-3">
              <h2 className="text-sm font-bold tracking-wide">記事の改変・公開</h2>
              <span className="text-[10px] font-mono text-neutral-500">GASLESS EIP-712</span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              改変の正当性を秘密鍵で証明。ガス代は一切発生しません。
            </p>
            
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-neutral-500 mb-1">章番号</label>
                <input
                  type="number"
                  value={chapterId}
                  onChange={(e) => setChapterId(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-neutral-800 p-2.5 text-xs font-mono focus:border-white focus:outline-none transition"
                />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-500 mb-1">IPFS CID (分散コンテンツID)</label>
                <input
                  type="text"
                  value={ipfsCid}
                  onChange={(e) => setIpfsCid(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 p-2.5 text-xs font-mono focus:border-white focus:outline-none transition"
                />
              </div>
            </div>
          </div>

          <div>
            <button
              onClick={signGaslessUpdate}
              className="w-full border border-neutral-700 hover:border-white bg-neutral-950 hover:bg-white text-white hover:text-black py-2.5 text-xs font-bold transition duration-150"
            >
              署名を発行（ガス代: 0 ETH）
            </button>
            {signature && (
              <div className="mt-3 p-3 bg-neutral-950 border border-neutral-900">
                <span className="text-[10px] text-neutral-500 block mb-0.5 font-mono">LATEST SIGNATURE:</span>
                <p className="text-[10px] font-mono text-neutral-300 break-all">{signature}</p>
              </div>
            )}
          </div>
        </div>

        {/* コア②：P2P直接支援 */}
        <div className="border border-neutral-800 p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-baseline border-b border-neutral-900 pb-3">
              <h2 className="text-sm font-bold tracking-wide">クリエイターへ即時送金</h2>
              <span className="text-[10px] font-mono text-neutral-500">P2P DIRECT 100%</span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              プラットフォームの財布を経由せず、スマートコントラクトから即時着金します。
            </p>

            <div>
              <label className="block text-[11px] text-neutral-500 mb-1">支援金額 (ETH)</label>
              <input
                type="text"
                value={supportAmount}
                onChange={(e) => setSupportAmount(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 p-2.5 text-xs font-mono focus:border-white focus:outline-none transition"
              />
            </div>
          </div>

          <div>
            <button
              onClick={handleSupport}
              className="w-full bg-white hover:bg-neutral-200 text-black py-2.5 text-xs font-bold transition duration-150"
            >
              100% ダイレクト送金
            </button>
            {txHash && (
              <div className="mt-3 p-3 bg-neutral-950 border border-neutral-900">
                <span className="text-[10px] text-neutral-500 block mb-0.5 font-mono">TX HASH:</span>
                <a 
                  href={`https://basescan.org/tx/${txHash}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-blue-400 hover:text-blue-300 break-all underline"
                >
                  {txHash}
                </a>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* アクティビティ・ストリーム（透明な取引ログ） */}
      <section className="border border-neutral-800 p-6">
        <div className="flex justify-between items-baseline border-b border-neutral-900 pb-3 mb-4">
          <h2 className="text-xs font-bold tracking-wider uppercase font-mono text-neutral-400">
            TRANSPARENT LEDGER STREAM
          </h2>
          <span className="text-[10px] text-neutral-600 font-mono">LIVE ON-CHAIN EVENTS</span>
        </div>

        {activities.length === 0 ? (
          <p className="text-xs text-neutral-600 font-mono py-4 text-center">
            まだオンチェーンイベントは発生していません。署名または送金を実行してください。
          </p>
        ) : (
          <div className="space-y-2">
            {activities.map((act) => (
              <div key={act.id} className="flex justify-between items-center text-xs font-mono border-b border-neutral-900/60 pb-2">
                <div className="flex items-center space-x-3">
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold ${act.type === 'TRANSFER' ? 'bg-white text-black' : 'border border-neutral-700 text-neutral-300'}`}>
                    {act.type}
                  </span>
                  <span className="text-neutral-300">{act.detail}</span>
                </div>
                <span className="text-neutral-600 text-[10px]">{act.timestamp}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* システムログ通知 */}
      {status && (
        <div className="mt-6 border-l border-white pl-3 py-1">
          <p className="text-[11px] font-mono text-neutral-400">{status}</p>
        </div>
      )}

    </main>
  );
}